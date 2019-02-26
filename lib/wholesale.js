const fs         = require('fs');
const path       = require('path');
const async      = require('async');
const needle     = require('needle');
const exec       = require('child_process').exec;
const extract    = require('extract-zip');
const byline     = require('byline');
const moment     = require('moment');
const config     = require('./config');
const logger     = require('bole')('wholesale');
const mongo      = require('./db');
const bot        = require('./wholesale-tg');

const cats = [
	{
		name: 'cab',
		collectionName: 'cabs',
		types: [ 'ap' ],
		defaultSort: { onuClli: 1 }
	},
	{
		name: 'node',
		collectionName: 'nodes',
		types: [ 'a', 'p' ],
		defaultSort: { nodeClli: 1 }
	}
];

setInterval(fetch, config('wholesale').fetch_interval * 1000);
fetch();

function fetch(cat = null, forced = false, callback) {
	let items = [];

	for (var i = 0; i < cats.length; i++) {
		if (cat && i != cat)
			continue;

		let _cat = cats[i];
		// Create indexes just in case we are importing in a fresh db
		mongo.db[_cat.collectionName].createIndex(_cat.defaultSort, { unique: true });

		for (type of _cat.types)
			items.push({ id: i, name: _cat.name, type: type });
	}

	let response = '';
	async.each(items, (item, end) => {
		let debugMsg = `Downloading ${item.name}-${item.type} ...`;
		logger.info(debugMsg);
		response += debugMsg + '<br>';
		
		download(item.name, item.type, forced, (err, xlsxPath) => {
			if (err) {
				end(err);
				return;
			}
			debugMsg = `Parsing ${item.name}-${item.type} ...`;
			logger.info(debugMsg);
			logger.info(xlsxPath);
			response += debugMsg + '<br>';
			
			convert(item.name, item.type, xlsxPath, (err, jsonPath) => {
				if (err) {
					end(err);
					return;
				}
				debugMsg = `Importing ${item.name}-${item.type} ...`;
				logger.info(debugMsg);
				logger.info(jsonPath);
				response += debugMsg + '<br>';
				
				importData(item.id, jsonPath, (err, out) => {
					if (err) {
						end(err);
						return;
					}
					debugMsg = `Imported ${out} ${item.name}-${item.type} row(s)`;
					logger.info(debugMsg);
					response += debugMsg + '<br>';

					end();
				});
			});
		});
	}, (err) => {
		if (err) {
			logger.error(err);
			if (callback)
				callback(err, null);
			return;
		}

		// Notify telegram users of changes
		if (bot.telegram) {
			mongo.db.telegram.find({}, (err, users) => {
				async.each(users, (user) => {
					mongo.db.cabs.count({ municipality: user.requestedMunicipality, isChanged: true }, (err, changedCount) => {
						mongo.db.cabs.count({ municipality: user.requestedMunicipality, isNew: true }, (err, newCount) => {
							if (!err && (changedCount > 0 || newCount > 0))
								bot.telegram.sendMessage(user.chatId,
														 `Hey! È stato appena aggiornato il database dei cabinet e nel comune di *${user.requestedMunicipality}* ci sono delle novità:\n\n🔵 Armadi aggiunti: *${newCount}*\n🔴 Armadi variati: *${changedCount}*\n\n🎊🚧🎉\n\nDai un'occhiata al [database](${config('telegram').site_link}) per ulteriori dettagli 🙂`,
														 { parse_mode: 'Markdown' });
						});
					});
				});
			});
		}

		if (callback)
			callback(null, response);
	});
}

const TEMP_DIR = require('os').tmpdir();

const lastBytes = [];
function download(cat, type, forced, callback) {
	let combined = cat + '-' + type;
	
	let urls = {
		'cab-ap': 'https://www.wholesale.telecomitalia.com/sitepub/SFTP/59_Coperture_Bitstream_NGA_e_VULA/Copertura%20attiva%20e%20pianificata%20FTTCab.zip',
		'node-a': 'https://www.wholesale.telecomitalia.com/sitepub/SFTP/59_Coperture_Bitstream_NGA_e_VULA/Centrali%20NGA%20attive.zip',
		'node-p': 'https://www.wholesale.telecomitalia.com/sitepub/SFTP/59_Coperture_Bitstream_NGA_e_VULA/Centrali%20NGA%20pianificate.zip'
	};
	
	let url = urls[combined];
	if (!url) {
		callback("No download URL available for request", null);
		return;
	}

	if (!forced) {
		needle.head(url, { ciphers: 'DES-CBC3-SHA' }, (err, res) => {
			if (err) {
				callback(err);
				return;
			}
			
			let bytes = res.headers['content-length'];
			
			if (lastBytes[combined] == bytes) {
				let msg = `File is unchanged since we last fetched it, aborting. (Old size in bytes: ${lastBytes[combined]} New size in bytes: ${bytes})`;
				callback(msg);
			}
			else {
				lastBytes[combined] = bytes;
				download_internal(url, callback);
			}
		});
	}
	else
		download_internal(url, callback);
}
function download_internal(url, callback) {
	let dest = path.join(TEMP_DIR, Date.now() + '.zip');

	needle.get(url, { output: dest, ciphers: 'DES-CBC3-SHA' }, (err) => {
		if (err) {
			callback(err);
			return;
		}
		
		let dir = path.join(TEMP_DIR, Date.now().toString());
		
		extract(dest, { dir: dir }, (err) => {
			if (err) {
				callback(err);
				return;
			}
			
			let files = fs.readdirSync(dir);
			callback(null, path.join(dir, files[0]));
		});
	});
}

function convert(cat, type, xlsxPath, callback) {	
	let args = [
		'python',
		'main.py',
		cat,
		type,
		`"${xlsxPath}"`
	];
	
	let cmd = args.join(' ');
	
	let options = {
		cwd: path.join(__dirname, '../parser')
	};
		
	exec(cmd, options, (err, stdout, stderr) => {
		if (err) {
			callback(err);
		}
		else if (stderr.trim() != '') {
			callback(new Error(stderr.toString()));
		}
		else {
			let p = stdout.toString().trim();
			callback(null, p);
		}
	});
}

function importData(cat, jsonPath, callback) {
	let stream = fs.createReadStream(jsonPath, {encoding: 'utf8'});
	let parser = byline.createStream(stream);

	let numObjects = 0;

	parser.on('data', (line) => {
		let obj = JSON.parse(line);

		// CABS
		//
		if (cat == 0) {
			let query = { onuClli: obj.onuClli };
			let newDoc = obj;

			let revision = {
				date: moment.utc().startOf('day').unix(),
				speed: newDoc.speed,
				status: newDoc.status,
				activationDate: newDoc.activationDate ? moment.utc(newDoc.activationDate, "D/M/YYYY").unix() : '',
				planningDate: newDoc.planningDate ? moment.utc(newDoc.planningDate, "MMMM YYYY").unix() : '',
				notes: newDoc.notes
			};
			if (isNaN(revision.activationDate))
				revision.activationDate = '';
			if (isNaN(revision.planningDate))
				revision.planningDate = '';

			mongo.db.cabs.find(query).limit(1).next((err, doc) => {
				if (!err && doc)
				{
					let hasChanged = false;

					if (doc.isNew != newDoc.isNew ||
						doc.isChanged != newDoc.isChanged ||
						doc.revisions[doc.revisions.length - 1].status != revision.status) {
						doc.revisions.push(revision);
						hasChanged = true;
					}

					// Remove duplicate revisions
					for (let i = doc.revisions.length - 1; i > 0; i--) {
						let curRev = doc.revisions[i];
						let prevRev = doc.revisions[i - 1];

						if (curRev.speed == prevRev.speed &&
							curRev.status == prevRev.status &&
							curRev.activationDate == prevRev.activationDate &&
							curRev.planningDate == prevRev.planningDate &&
							curRev.notes == prevRev.notes) {
							doc.revisions.splice(i, 1);
							hasChanged = true;
						}
					}

					if (hasChanged) {
						mongo.db.cabs.update(query, doc, { upsert: true }, (err, obj) => {
							if (!err)
								numObjects++;
						});
					}
				}
				else
				{
					newDoc.revisions = [ revision ];
					delete newDoc.speed;
					delete newDoc.status;
					delete newDoc.activationDate;
					delete newDoc.planningDate;
					delete newDoc.notes;

					mongo.db.cabs.insert(newDoc, (err, obj) => {
						if (!err)
							numObjects++;
					});
				}
			});
		}
		// NODES
		// 
		else if (cat == 1) {
			let query = { nodeClli: obj.nodeClli };
			let newDoc = obj;

			let revision = {
				date: moment.utc().startOf('day').unix(),
				variationState: newDoc.variationState,
				vula1Gbit: newDoc.vula1Gbit,
				vula10Gbit: newDoc.vula10Gbit,
				notes: newDoc.notes,
				activationDate: newDoc.activationDate ? moment.utc(newDoc.activationDate, "D/M/YYYY").unix() : '',
				planningDate: newDoc.planningDate ? moment.utc(newDoc.planningDate, "MMMM YYYY").unix() : '',
			};
			if (isNaN(revision.activationDate))
				revision.activationDate = '';
			if (isNaN(revision.planningDate))
				revision.planningDate = '';

			mongo.db.nodes.find(query).limit(1).next((err, doc) => {
				if (!err && doc)
				{
					let hasChanged = false;

					if (doc.isNew != newDoc.isNew ||
						doc.isChanged != newDoc.isChanged ||
						doc.revisions[doc.revisions.length - 1].variationState != revision.variationState) {
						doc.revisions.push(revision);
						hasChanged = true;
					}

					// Remove duplicate revisions
					for (let i = doc.revisions.length - 1; i > 0; i--) {
						let curRev = doc.revisions[i];
						let prevRev = doc.revisions[i - 1];

						if (curRev.variationState == prevRev.variationState &&
							curRev.vula1Gbit == prevRev.vula1Gbit &&
							curRev.vula10Gbit == prevRev.vula10Gbit &&
							curRev.notes == prevRev.notes &&
							curRev.activationDate == prevRev.activationDate &&
							curRev.planningDate == prevRev.planningDate) {
							doc.revisions.splice(i, 1);
							hasChanged = true;
						}
					}

					if (hasChanged) {
						mongo.db.nodes.update(query, doc, { upsert: true }, (err, obj) => {
							if (!err)
								numObjects++;
						});
					}
				}
				else
				{
					newDoc.revisions = [ revision ];
					delete newDoc.variationState;
					delete newDoc.vula1Gbit;
					delete newDoc.vula10Gbit;
					delete newDoc.notes;
					delete newDoc.activationDate;
					delete newDoc.planningDate;

					mongo.db.nodes.insert(newDoc, (err, obj) => {
						if (!err)
							numObjects++;
					});
				}
			});
		}
	});
	parser.on('end', () => {
		if (numObjects > 0)
			mongo.db._info.update({ cat: cat }, { cat: cat, lastUpdated: moment().utc().unix() }, { upsert: true });

		callback(null, numObjects);
	});
}

module.exports = {
	cats,
	fetch
};
