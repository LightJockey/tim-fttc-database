const mongojs = require('mongojs');
const config  = require('../config');
const logger  = require('bole')('db');

const dbOptions = { connectTimeoutMS: 5000 };
const db = mongojs(config('db').connectionString, null, dbOptions);

db.on('error', (err) => {
	logger.error(err);
});

db.on('connect', () => {
	logger.info('DB connected');
});

db.on('timeout', () => {
	throw new Error('DB timeout');
});

db.stats((err, res) => {
	if (err) {
		logger.error(err, 'db.stats error');
		return;
	}
	
	logger.info(res);
	logger.info('DB initialized');
});

module.exports.db = db;
