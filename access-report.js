'use strict';

var nextList = [],
	soap = require('soap-cascade'),
	client = {},
	soapArgs = {
		authentication: {
			password: '',
			username: ''
		},
		identifier: {
			path: {
				path: '',
				siteName: ''
			},
			type: 'folder',
			recycled: 'false'
		}
	},
	rules,
	prompt = require('prompt'),
	authenticationPrompt = [
		{
			name: 'server',
			message: 'server:', // 'Server'.grey + ':'.white,
			validator: /^https?:\/\/(?:(?!10(?:\.\d{1,3}){3})(?!127(?:\.\d{1,3}){3})(?!169\.254(?:\.\d{1,3}){2})(?!192\.168(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]+-?)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?$/,
			warning: 'Should be in the form of http:\/\/cms.your.org with an optional port https:\/\/cms.your.org:8080',
			'default': 'https:\/\/cascade.yoursite.edu'
		},
		{
			name: 'username',
			message: 'Username'.grey + ':'.white,
			validator: /^[a-zA-Z\s\-]+$/,
			warning: 'Username must be only letters, spaces, or dashes',
			'default': 'username'
		},
		{
			name: 'password',
			message: 'Password'.grey + ':'.white,
			hidden: true
		},
		{
			name: 'site',
			message: 'Cascade Server Site'.grey + ':'.white,
			'default': 'siteName'
		},
		{
			name: 'rootPath',
			message: 'Starting path'.grey + ':'.white,
			'default': '/'
		}
	],
	accessLevels = [
		'none',
		'read',
		'write'
	];

// Utility Functions

/*
 *
 */
function next() {
	var todo,
		current,
		task,
		args = {};
	if (arguments.length > 0) { // if we were called with something to add to the list
		if (!Array.isArray(arguments['0'])) { // if it was not an array make it into one
			todo = [arguments];
		} else { // break out the array
			todo = [];
			arguments['0'].forEach(function (item) {
				todo.push(item);
			});
		}
		nextList = todo.concat(nextList); // add the items to the front of the array and Wes suggests unshifting these onto the existing array as being faster
	}
	if (nextList.length > 0) { // if there are things to process
		current = Array.prototype.slice.apply(nextList.shift());
		task = current[0];
		args = current.slice(1);
		task.apply(null, args);
	}
}

function repeat(string, number) {
	var result = '',
		index = 0;
	for (index = 0; index < number; index++) {
		result += string;
	}
	return result;
}

function findByMatchingProperties(set, properties) {
	return set.filter(function (entry) {
		return Object.keys(properties).every(function (key) {
			return entry[key] === properties[key];
		});
	});
}

// ACL specific functions
function report(message) {
	if (typeof message === 'string') {
		console.log(message);
	} else {
		console.dir(message);
	}
	next();
}

function handleError(err) {
	if (err.code === 'ECONNRESET') {
		next(report, 'SAW ECONNRESET');
	} else {
		next(report, err);
	}
}

/*
 *
 *
 *
 *
 */
function readFolder(args, parentACL, path, type, depth) {
	var calls = [],
		i = 0;
	args.identifier.path.path = path;
	args.identifier.type = type;
	client.read(args, function (err, response) {
		if (err) {
			next(handleError, err);
		} else {
			if (response.readReturn.success === 'true') {
				if (response.readReturn.asset.folder.children.child) {
					if (!Array.isArray(response.readReturn.asset.folder.children.child)) {
						response.readReturn.asset.folder.children.child = [response.readReturn.asset.folder.children.child];
					}
					// sort the array with folders first - results are often in correct order from server, but lets make sure
					response.readReturn.asset.folder.children.child.sort(function (a, b) {
						var swap,
							aIsFolder = a.type === 'folder',
							bIsFolder = b.type === 'folder',
							aName = a.path.path.toLowerCase(),
							bName = b.path.path.toLowerCase();
						if (aIsFolder && bIsFolder) {
							swap = (aName > bName) ? 1 : -1;
						} else if (aIsFolder || bIsFolder) {
							swap = (bIsFolder) ? 1 : -1;
						} else {
							swap = (aName > bName) ? 1 : -1;
						}
						return swap;
					});
					depth++;
					response.readReturn.asset.folder.children.child.forEach(function (item) {
						// avoiding reading files, but then we don't get the file metadata.
						// have to read folders to traverse them, not heavy cost
						// have to read pages to get contentType
						// could have a read all flag that gets set manually, or with the rule file
						calls[i++] = [readAccess, args, parentACL, item.path.path, item.type, depth];
					});
					next(calls);
				} else {
					next(report, 'empty folder');
				}
			} else {
				next(report, response.readReturn.message);
			}
		}
	});
}

// read Access
function readAccess(args, parentACL, path, type, depth) {
	var thisACL; // shortcut from response
	args.identifier.path.path = path;
	args.identifier.type = type;
	client.readAccessRights(args, function (err, response) {
		if (err) {
			next(handleError, err);
		} else {
			if (response.readAccessRightsReturn.success.toString() === 'true') {
				thisACL = response.readAccessRightsReturn.accessRightsInformation;
				// normalize thisACL
				if (!thisACL.aclEntries) {
					thisACL.aclEntries = {};
				}
				// normalize thisACL entries
				if (!thisACL.aclEntries.aclEntry) {
					thisACL.aclEntries.aclEntry = [];
				} else {
				// normalize thisACL entries as an array
					if (!Array.isArray(thisACL.aclEntries.aclEntry)) {
						thisACL.aclEntries.aclEntry = [thisACL.aclEntries.aclEntry];
					}
				}
				// normalize parentACL
				if (!parentACL.aclEntries) {
					parentACL.aclEntries = {};
				}
				// normalize parentACL entries
				if (!parentACL.aclEntries.aclEntry) {
					parentACL.aclEntries.aclEntry = [];
				}

				console.log(repeat(' ', depth * 2) + type + ':' + path);
				//check the all level
				if (thisACL.allLevel !== parentACL.allLevel) {
					console.log(repeat(' ', depth * 2) + 'the all level changed from '.red + parentACL.allLevel + ' to ' + thisACL.allLevel);
				}
				if (thisACL.aclEntries.aclEntry) {
					// check existing acls for missing in new
					thisACL.aclEntries.aclEntry.forEach(function (acl) {
						if (!findByMatchingProperties(parentACL.aclEntries.aclEntry, acl)[0]) {
							console.log(repeat(' ', depth * 2) + acl.level + ' access added for '.green + acl.type + ' ' + acl.name);
						}
					});
				}
				if (parentACL.aclEntries.aclEntry) {
					// check new for additions to existing
					parentACL.aclEntries.aclEntry.forEach(function (acl) {
						if (!findByMatchingProperties(thisACL.aclEntries.aclEntry, acl)[0]) {
							console.log(repeat(' ', depth * 2) + acl.level + ' access removed for '.red + acl.type + ' ' + acl.name);
						}
					});
				}
				if (type === 'folder') {
					// go read in more
					next(readFolder, args, thisACL, path, type, depth);
				} else {
					next();
				}
			} else {
				next(report, response.readAccessRightsReturn.message);
			}
		}
	});
}

function createClient(url, startPath) {
	var wsPath = '/ws/services/AssetOperationService?wsdl';
	soap.createClient(url + wsPath, function (err, newClient) {
		if (err) {
			next(handleError, err);
		} else {
			client = newClient;
			next(readAccess, soapArgs, {}, startPath, 'folder', 0); // begin the call chain
		}
	});
}

// Main
console.log('Cascade Server Access Report'.cyan);
console.log('by Jason Aller');
prompt.message = '';
prompt.delimiter = '';
prompt.start();

prompt.get(authenticationPrompt, function (err, result) {
	if (!err) {
		soapArgs.authentication.username = result.username;
		soapArgs.authentication.password = result.password;
		soapArgs.identifier.path.siteName = result.site;
		next([
			[report, 'start'],
			[createClient, result.server, result.rootPath],
			[report, 'end']
		]);
	} else {
		return 'canceled by user';
	}
});

