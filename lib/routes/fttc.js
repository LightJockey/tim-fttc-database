const async     = require('async');
const Boom      = require('boom');
const Joi       = require('joi');
const moment    = require('moment');
const logger    = require('bole')('fttc');
const mongo     = require('../db');
const wholesale = require('../wholesale.js');

let get = {
	method: 'GET',
	path: '/fttc',
	handler(request, reply) {
		let cat = request.query.cat;

		let query = {};

		if (request.query.type == 1)
			query.isNew = true;
		else if (request.query.type == 2)
			query.isChanged = true;

		if (request.query.region)
			query.region = new RegExp('^' + request.query.region + '$', 'i');
		if (request.query.district)
			query.district = new RegExp('^' + request.query.district + '$', 'i');
		if (request.query.municipality)
			query.municipality = new RegExp('^' + request.query.municipality + '$', 'i');
		if (request.query.nodeClli)
			query.nodeClli = new RegExp(request.query.nodeClli, 'i');
		if (request.query.onuId)
			query.onuId = new RegExp(request.query.onuId, 'i');
		
		let limit = request.query['limit'] || 100;
		let page = request.query['page'] || 1;
		let skip = (page - 1) * limit;

		mongo.db[wholesale.cats[cat].collectionName].count(query, (err, count) => {
			if (err) {
				request.log('error', err);
				reply(Boom.internal());
				return;
			}
			
			mongo.db[wholesale.cats[cat].collectionName].find(query).sort(wholesale.cats[cat].defaultSort).skip(skip).limit(limit, (err, docs) => {
				if (err) {
					request.log('error', err);
					reply(Boom.internal());
					return;
				}

				for (doc of docs) {
					for (revision of doc.revisions) {
						revision.date = revision.date ? moment.unix(revision.date).format("DD/MM/YYYY") : '';
						revision.activationDate = revision.activationDate ? moment.unix(revision.activationDate).format("DD/MM/YYYY") : '';
						revision.planningDate = revision.planningDate ? moment.unix(revision.planningDate).format("MMMM YYYY") : '';
					}
					doc.revisions.reverse();
				}
				
				let startIndex = (page - 1) * limit;
				let endIndex = startIndex + 100;
				
				reply(docs).header('Content-Range', `items ${startIndex}-${endIndex}/${count}`);
			});
		});
	},
	config: {
		validate: {
			query: {
				cat: Joi.number().integer().min(0).max(wholesale.cats.length - 1).required(),
				type: Joi.number().integer().min(0).max(2),
				region: Joi.string().allow(''),
				district: Joi.string().allow(''),
				municipality: Joi.string().allow(''),
				nodeClli: Joi.string().allow(''),
				onuId: Joi.string().allow(''),
				limit: Joi.number().integer().default(25),
				page: Joi.number().integer().default(1)
			},
			options: {
				allowUnknown: true
			}
		}
	}
};

let getCats = {
	method: 'GET',
	path: '/fttc/cats',
	handler(request, reply) {
		async.times(wholesale.cats.length, (n, next) => {
			let cat = wholesale.cats[n];
			mongo.db[cat.collectionName].count({}, (err, count) => {
				if (err) {
					logger.error(err);
					reply(Boom.internal());
					return;
				}
				mongo.db._info.find({ cat: n }).limit(1, (err, infoObj) => {
					if (err) {
						logger.error(err);
						reply(Boom.internal());
						return;
					}
					next(err, { name: cat.name, numItems: count, lastUpdated: moment.unix(infoObj.lastUpdated || moment().unix()).format("DD/MM/YYYY") });
				});
			});
		}, (err, result) => {
			reply(result);
		});
	}
};

let getRegions = {
	method: 'GET',
	path: '/fttc/regions',
	handler(request, reply) {
		mongo.db[wholesale.cats[request.query.cat].collectionName].distinct("region", {}, (err, regions) => {
			if (err) {
				logger.error(err);
				reply(Boom.internal());
				return;
			}
			reply(regions);
		});
	},
	config: {
		validate: {
			query: {
				cat: Joi.number().integer().min(0).max(wholesale.cats.length - 1).required()
			},
			options: {
				allowUnknown: true
			}
		}
	}
};

let del = {
	method: 'DELETE',
	path: '/fttc',
	handler(request, reply) {
		mongo.db[wholesale.cats[request.query.cat].collectionName].remove(request.query, (err) => {
			if (err) {
				logger.error(err);
				reply(Boom.internal());
				return;
			}
			reply().code(204);
		});
	},
	config: {
		validate: {
			query: {
				cat: Joi.number().integer().min(0).max(wholesale.cats.length - 1).required()
			},
			options: {
				allowUnknown: true
			}
		}
	}
};

let fetch = {
	method: 'GET',
	path: '/fetch',
	handler(request, reply) {
		wholesale.fetch(request.query.cat, false, (err, res) => {
			if (err) {
				request.log('error', err);
				reply(Boom.internal(err.message));
				return;
			}
			reply(res);
		});
	},
	config: {
		validate: {
			query: {
				cat: Joi.number().integer().min(0).max(wholesale.cats.length - 1).required()
			},
			options: {
				allowUnknown: true
			}
		}
	}
};

module.exports = [get, getCats, getRegions, del, fetch];
