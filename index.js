// Initialize the logger
const bole = require('bole');

bole.output([{ level: 'debug', stream: process.stdout }]);

const logger = bole('index');
logger.info('fttc-database is booting...');

// When an expection occurs,
// log the 'Error' and euthanasia
process.on('uncaughtException', (err) => {
	logger.error(err);
	// We can safely exit because the only logger output is stdout,
	// which is flushed automatically when the process shuts down
	process.exit(1);
});

require('./lib/server.js');
require('./lib/wholesale-tg.js');
