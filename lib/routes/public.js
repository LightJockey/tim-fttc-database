const path = require('path');

let get = {
	method: 'GET',
	path: '/{param*}',
	handler: {
		directory: {
			path: path.join(__dirname, '../public'),
			index: true
		}
	}
};

module.exports = [get];
