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
	/*
	re_weburl = new RegExp( //Author: Diego Perini
		"^" +
		// protocol identifier
		"https?://" +
		"(?:" +
		// IP address exclusion
		// private & local networks
		"(?!10(?:\\.\\d{1,3}){3})" +
		"(?!127(?:\\.\\d{1,3}){3})" +
		"(?!169\\.254(?:\\.\\d{1,3}){2})" +
		"(?!192\\.168(?:\\.\\d{1,3}){2})" +
		"(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +
		// IP address dotted notation octets
		// excludes loopback network 0.0.0.0
		// excludes reserved space >= 224.0.0.0
		// excludes network & broacast addresses
		// (first & last IP address of each class)
		"(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" +
		"(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" +
		"(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" +
		"|" +
		// host name
		"(?:(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)" +
		// domain name
		"(?:\\.(?:[a-z\\u00a1-\\uffff0-9]+-?)*[a-z\\u00a1-\\uffff0-9]+)*" +
		// TLD identifier
		"(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))" +
		")" +
		// port number
		"(?::\\d{2,5})?" +
		// resource path
		"$", "i"
	),
	*/
	authenticationPrompt = [
		{
			name: 'server',
			message: 'Server'.grey + ':'.white,
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
		},
		{
			name: 'rulesFileName',
			message: 'Which rules file'.grey + ':'.white,
			'default': 'siterules.json'
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
		nextList = todo.concat(nextList);
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
		next(report, 'SAW ECONNRESET'); // should be fixed in nodejs v0.11+
	} else {
		next(report, err);
	}
}

function escapeRegExp(str) {
	return str.replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g, "\\$&"); // was /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g
}

/*
 *
 *
 *
 *
 */
function aclsFromRules(path, type, depth, metadata, contentType) {
	// from all rules
	// grab those that match in any way
	// if there are override rules drop normal rules
	// reduce duplicate rules in favor of greater access level
	// return acls

	var assetNameMatch, //boolean set true by matching method
		contentTypeMatch,
		assetTypeMatch,
		metaDataMatch,
		hasRule,
		pattern, // for regex
		action, // object to store in changes
		changes = [], // all possible changes
		changeSwap, // second array for processing changes
		processed, // a flag
		dupe, // a flag
		ruleNames, // used to combine rule names
		maxLevel, // when combining changes retain highest level of access
		mode, // rule mode add or override
		overrideFlag; // is there an override in the current changes?
	overrideFlag = false;
	rules.forEach(function (rule) {
		// later limit match on depth, or depth range?
		hasRule = false;
		// match on assetType
		if (rule.assetType) {
			assetTypeMatch = rule.assetType === type; // exact match, no wildcards? maybe allow match any one of? split on comma?
			hasRule = true;
		} else {
			assetTypeMatch = true;
		}
		// match on assetName
		if (rule.assetName) {
			// pre clean the rule for regex characters
			pattern = new RegExp("^" + escapeRegExp(rule.assetName).replace(/\*/g, ".*"), "i"); // path match - matches from start of path name
			assetNameMatch = path.match(pattern) !== null;
			hasRule = true;
		} else {
			assetNameMatch = true;
		}
		// match on contentType
		if (rule.pageContentType && contentType) {
			contentTypeMatch = rule.pageContentType === contentType;
			hasRule = true;
		} else {
			contentTypeMatch = true;
		}
		// match on metadata
		if (rule.metadata) { // if not checking for metadata at this point we should comment it out
			// complex matching assuming and of all tests, handle both wired and dynamic metadata fields
			metaDataMatch = true;
			rule.metadata.forEach(function (meta) {
				// need to handle dynamic metadata as well
				// likely need to work out symbol handling for greater than and less than for dates
				// if feeling really nice parse dates
				if (metadata && metadata[meta.fieldname] && metadata[meta.fieldname].length) {
					pattern = new RegExp("^" + meta.match.replace(/\*/g, ".*"), "i"); // asset name match
					metaDataMatch = metaDataMatch && metadata[meta.fieldname].match(pattern);
				} else {
					metaDataMatch = false;
				}
			});
			hasRule = true;
		} else {
			metaDataMatch = true;
		}
		// if we have matched on all triggering criteria, non specified criteria are ignored.
		if (hasRule && assetTypeMatch && assetNameMatch && contentTypeMatch && metaDataMatch) { // also check to see that at least one rule matched?
			if (rule.action) {
				mode = rule.action;
			} else {
				mode = 'add';
			}
			if (rule.action && rule.action === 'override') {
				overrideFlag = true;
			}
			if (rule.acls) {
				rule.acls.forEach(function (acl) {
					action = {};
					action.mode = mode;
					action.level = acl.level || 'none';
					action.type = acl.type || 'group';
					action.name = acl.name;
					if (rule.name) {
						action.rulename = rule.name;
					}
					changes.push(action);
				});
			}
			if (rule.all) {
				action = {};
				action.mode = mode;
				action.level = rule.all;
				action.type = 'all';
				action.name = '';
				if (rule.name) {
					action.rulename = rule.name;
				}
				changes.push(action);
			}
		}
	});

	// if any override rules were matched then drop all non-override rules
	changeSwap = [];
	if (overrideFlag) {
		changes.forEach(function (change) {
			if (change.mode === 'override') {
				changeSwap.push(change);
			}
		});
	} else {
		changeSwap = changes;
	}

	// sort by rule type and then group or user name
	changeSwap.sort(function (a, b) {
		var swap;
		if (a.type === b.type) {
			swap = (a.name > b.name) ? 1 : -1;
		} else {
			swap = (a.type > b.type) ? 1 : -1;
		}
		return swap;
	});

	// remove duplicate rules and pick the higher level of access if there is a conflict
	changes = [];
	changeSwap.forEach(function (change, changeIndex) {
		processed = false;
		changes.forEach(function (filtered) {
			// do we have a copy of this rule already, if so then skip
			if (change.type === filtered.type && change.name === filtered.name) {
				processed = true;
			}
		});
		dupe = false;
		ruleNames = change.rulename;
		maxLevel = change.level;
		if (!processed) {
			changeSwap.forEach(function (check, checkIndex) {
				if (changeIndex !== checkIndex && change.type === check.type && change.name === check.name) {
					dupe = true;
					if (check.rulename) {
						ruleNames += ', ' + check.rulename;
					}
					if (accessLevels.indexOf(maxLevel) < accessLevels.indexOf(check.level)) {
						maxLevel = check.level;
					}
				}
			});
			if (!dupe) {
				changes.push(change);
			} else {
				action = {};
				action.mode = change.mode;
				action.level = maxLevel;
				action.type = change.type;
				action.name = change.name;
				action.rulename = 'combined: ' + ruleNames;
				changes.push(action);
			}
		}
	});
	return changes;
}

/*
 *
 *
 *
 *
 */
function editAccess(args) {
	client.editAccessRights(args, function (err, response) {
		if (err) {
			next(handleError, err);
		} else {
			if (response.editAccessRightsReturn.success[0].toString() === 'true') {
				next();
			} else {
				next(report, response.editAccessRightsReturn.message);
			}
		}
	});
}

/*
 *
 *
 *
 *
 */
function readAccess(args, path, type, depth, metadata, contentType) {
	var title = '',
		accessRightsInformation, // shortcut from response
		newArgs = {},
		changes,
		needToUpdate = false;
	args.identifier.path.path = path;
	args.identifier.type = type;
	client.readAccessRights(args, function (err, response) {
		if (err) {
			next(handleError, err);
		} else {
			if (response.readAccessRightsReturn.success.toString() === 'true') {
				accessRightsInformation = response.readAccessRightsReturn.accessRightsInformation;
				if (accessRightsInformation.aclEntries.aclEntry) {
					if (!Array.isArray(accessRightsInformation.aclEntries.aclEntry)) { // normalize entries as array
						accessRightsInformation.aclEntries.aclEntry = [accessRightsInformation.aclEntries.aclEntry];
					}

					if (metadata.displayName.length) {
						title = metadata.displayName;
					}
				}
				changes = aclsFromRules(path, type, depth, metadata, contentType);

				// check operations mode -  add new access - still check for conflict
				// or replace all access

				newArgs.authentication = args.authentication;
				newArgs.accessRightsInformation = {};
				newArgs.accessRightsInformation.identifier = args.identifier;
				newArgs.accessRightsInformation.aclEntries = {};
				newArgs.accessRightsInformation.aclEntries.aclEntry = [];
				newArgs.accessRightsInformation.allLevel = 'none';
				newArgs.applyToChildren = 'false';

				changes.forEach(function (change) {
					// build newArgs?
					if (change.type !== 'all') {
						var acl = {};
						acl.level = change.level;
						acl.type = change.type;
						acl.name = change.name;
						newArgs.accessRightsInformation.aclEntries.aclEntry.push(acl);
					} else {
						newArgs.accessRightsInformation.allLevel = change.level;
					}
				});
				console.log(repeat(' ', depth * 2) + type + ':' + path + ':' + title + ':' + contentType);
				//check the all level
				if (accessRightsInformation.allLevel !== newArgs.accessRightsInformation.allLevel) {
					needToUpdate = true;
				} else {
					if (accessRightsInformation.aclEntries.aclEntry) {
						if (newArgs.accessRightsInformation.aclEntries.aclEntry) {
							// check existing acls for missing in new
							accessRightsInformation.aclEntries.aclEntry.forEach(function (entry) {
								if (!findByMatchingProperties(newArgs.accessRightsInformation.aclEntries.aclEntry, entry)[0]) {
									console.log(repeat(' ', depth * 2) + 'REMOVING ' + entry.name);
									needToUpdate = true;
								}
							});
						} else {
							needToUpdate = true;
						}
					}
					if (newArgs.accessRightsInformation.aclEntries.aclEntry) {
						if (accessRightsInformation.aclEntries.aclEntry) {
							// check new for additions to existing
							newArgs.accessRightsInformation.aclEntries.aclEntry.forEach(function (entry) {
								if (!findByMatchingProperties(accessRightsInformation.aclEntries.aclEntry, entry)[0]) {
									console.log(repeat(' ', depth * 2) + 'ADDING ' + entry.name);
									needToUpdate = true;
								}
							});
						} else {
							needToUpdate = true;
						}
					}
				}
				if (needToUpdate) {
					next(editAccess, newArgs);
				} else {
					next();
				}
			} else {
				next(report, response.readAccessRightsReturn.message);
			}
		}
	});
}

/*
 *
 *
 *
 *
 */
function readAsset(args, path, type, depth) {
	var metadata,
		calls = [],
		i = 0;
	args.identifier.path.path = path;
	args.identifier.type = type;
	client.read(args, function (err, response) {
		if (err) {
			next(handleError, err);
		} else {
			if (response.readReturn.success.toString() === 'true') {
				 // get metadata
				metadata = response.readReturn.asset[type].metadata;
				if (type === 'page') {
					next(readAccess, args, path, type, depth, metadata, response.readReturn.asset.page.contentTypePath);
				} else {
					// assuming 'folder'
					calls[i++] = [readAccess, args, path, type, depth, metadata, ''];
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
							if (item.type === 'folder') {
								calls[i++] = [readAsset, args, item.path.path, item.type, depth];
							} else if (item.type === 'page') {
								calls[i++] = [readAsset, args, item.path.path, item.type, depth];
							} else {
								calls[i++] = [readAccess, args, item.path.path, item.type, depth, metadata, ''];
							}
						});
						next(calls);
					} else {
						next(report, 'empty directory ' + path);
						// we had an empty directory and have already set up the call to handle access for it
					}
				}
			} else {
				console.log('read failure:');
				next(report, response.readReturn.message);
			}
		}
	});
}

/*
 *
 *
 *
 *
 */
function createClient(url, startPath) {
	var wsPath = '/ws/services/AssetOperationService?wsdl';
	soap.createClient(url + wsPath, function (err, newClient) {
		if (err) {
			next(handleError, err);
		} else {
			client = newClient;
			next(readAsset, soapArgs, startPath, 'folder', 0); // begin the call chain
		}
	});
}

/*
 *
 *
 *
 *
 */
console.log('Cascade Server Access Rules Engine'.cyan);
console.log('by Jason Aller');
prompt.message = '';
prompt.delimiter = '';
prompt.start();

prompt.get(authenticationPrompt, function (err, result) {
	if (!err) {
		soapArgs.authentication.username = result.username;
		soapArgs.authentication.password = result.password;
		soapArgs.identifier.path.siteName = result.site;

		rules = require('./' + result.rulesFileName);

		console.log('loaded ' + rules.length + ' rules from file');
//		console.dir(rules);

		next([
			[report, 'start'],
			[createClient, result.server, result.rootPath],
			// can report exceptions here?
			[report, 'end']
		]);
	} else {
		return 'canceled by user'; // onErr(err);
	}
});
