Casacde Access Tool
================

Caution: these tools will allow you to make changes to your Cascade Server. 
They will allow you to make site wide changes to all of your assets. 
As such you should: 
* review the code
* start with `node access-report.js`, document the current settings for your site
* make your own `siterules.json` file for each site you will work with
* run the tool against your test server with a full copy of the data restored from your production server before pointing it at your production server

The actions this tool takes are guided by the content of the file of rules you provide to it.
If you tell this tool to remove all access to your assets it will do that.

# Rule Files

Rule files hold JSON objects and their filenames end with `.json`. 
You can use a JSON validator tool to make sure that the syntax of the file is proper JSON.

The outer wrapper should be an array. Within that appear the rules as objects.


`"name":` entries are for documentation and debugging purposes.

`"action":` entries with the value of "override" change the mode of the rule. Once set other non-override rules will not apply to matching objects.

`"assetName":` entries will match asset names and paths and allow the use of wildcards `*`.

`"pageContentType":` entries only work with page assets. It allows matching based on the page Content Type. This can be used alone, or in combination with assetName.

`"all":` entries support the following values `"none"`, `"read"`, and `"write"`

`"acls":` mark the start of an array that will hold acl objects.

acl objects need values supplied for `"level"`, `"type"`, and `"name"`.

`"level"` should contain either `"read"` or `"write"`.

`"type"` should contain either `"group"` or `"user"`

## Sample Rules File

```
[
	{
		"name": "Let Marketing edit everything",
		"assetName": "*",
		"acls": [
			{
				"level": "write",
				"type": "group",
				"name": "Marketing"
			}
		],
		"all": "read"
	},
	{
		"name": "Let faculty read their directory",
		"assetName": "faculty*",
		"acls": [
			{
				"level": "read",
				"type": "group",
				"name": "faculty"
			}
		]
	},
	{
		"name": "Let the Dean edit their directory",
		"assetName": "faculty/dean",
		"acls": [
			{
				"level": "write",
				"type": "user",
				"name": "dean"
			}
		]
	},
	{
		"name": "hide programmatic assets overriding other rules",
		"action": "override",
		"assetName": "*.txt",
		"acls": [
			{
				"level": "write",
				"type": "group",
				"name": "IT"
			}
		],
		"all": "none"
	},
	{
		"name": "protect internal assets",
		"action": "override",
		"assetName": "_internal*",
		"all": "none"
	},
	{
		"name": "event",
		"pageContentType": "event",
		"acls": [
			{
				"level": "write",
				"type": "group",
				"name": "externalRelations"
			},
			{
				"level": "read",
				"type": "group",
				"name": "IT"
			},
			{
				"level": "read",
				"type": "group",
				"name": "marketing"
			}
		],
		"all": "write"
	}
]
```

# Installation Notes

You will need NodeJS installed. In order to install the depencies you may need to install a complier based on your operating system.

Once you have cloned a copy of this on your workstation change directory to it and `npm install`. 
This should install both prompt and soap-cascade.
