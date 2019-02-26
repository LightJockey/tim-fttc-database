const logger = require('bole')('server');
const Hapi   = require('hapi');
const moment = require('moment');

const config  = require('./config');

moment.locale('it');

// Create the HTTP server
const server = new Hapi.Server({
	useDomains: false,
	debug: false,
	connections: {
		router: {
			stripTrailingSlash: true,
			isCaseSensitive: false
		},
		routes: {
			payload: { allow: 'application/json' }
		}
	}
});

server.connection({
	host: '0.0.0.0',
	port: config('server').port || 8080
});

server.on('request', (request, event, tags) => {
	// If loggin an error related to a request
	if (tags.error) {
		// Bring together some information about the request
		let r = {
			method: request.method,
			path: request.url.path,
			headers: request.headers,
			remoteAddress: request.connection.remoteAddress,
			payload: request.payload
		};
		
		let error;
		
		if (event['data'] instanceof Error) {
			error = {
				message: event['data']['message'],
				name: event['data']['name'],
				stack: event['data']['stack']
			};
		}
		else {
			error = event['data'];
		}
		
		let log = { request: r, error: error };
		
		logger.error(log);
	}
	// Otherwise take the first tag and use it as a log level
	else {
		logger[event['tags'][0]](event['data']);
	}
});

server.on('log', (event, tags) => {
	if (tags.error) {
		// Ignore connection errors
		if (!tags.connection) {
			logger.error(event['data']);
		}
	}
	else if (tags.load) {
		logger.warn(event['data']);
	}
	else {
		logger[event['tags'][0]](event['data']);
	}
});

server.on('response', (request) => {
	let text = request.method.toUpperCase() + ' ' + request.url.path + ' ' + (request.response.statusCode || '-');
	
	server.log('info', text);
});

const plugins = [
	{ register: require('inert') },
	{ register: require('./plugins/routes.js'), options: { directory: __dirname + '/routes' } }
];

// Start the server
server.register(plugins, (err) => {
	if (err) {
		throw err;
	}
	
	server.start((err) => {
		if (err) {
			throw err;
		}
		
		server.log('info', 'Server running at ' + server.info.uri);
	});
});

module.exports = server;
