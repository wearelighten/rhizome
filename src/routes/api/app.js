'use strict';

/**
 * ButtressJS - Realtime datastore for software
 *
 * @file app.js
 * @description App API specification
 * @module API
 * @author Chris Bates-Keegan
 *
 */

const Route = require('../route');
const Model = require('../../model');
const Logging = require('../../logging');
const Schema = require('../../schema');

const routes = [];

/**
 * @class GetAppList
 */
class GetAppList extends Route {
	constructor() {
		super('app', 'GET APP LIST');
		this.verb = Route.Constants.Verbs.GET;
		this.auth = Route.Constants.Auth.SUPER;
		this.permissions = Route.Constants.Permissions.LIST;
	}

	_validate(req, res, token) {
		return Promise.resolve(true);
	}

	_exec(req, res, validate) {
		return Model.App.findAll();
	}
}
routes.push(GetAppList);

/**
 * @class GetApp
 */
class GetApp extends Route {
	constructor() {
		super('app/:id([0-9|a-f|A-F]{24})', 'GET APP');
		this.verb = Route.Constants.Verbs.GET;
		this.auth = Route.Constants.Auth.SUPER;
		this.permissions = Route.Constants.Permissions.READ;

		this._app = false;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.params.id) {
				this.log('ERROR: Missing required field', Route.LogLevel.ERR);
				reject({statusCode: 400});
				return;
			}
			Model.App.findById(req.params.id).populate('_token').then((app) => {
				if (!app) {
					this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				// this.log(app._token, Route.LogLevel.DEBUG);
				this._app = app;
				resolve(true);
			});
		});
	}

	_exec(req, res, validate) {
		return new Promise((resolve, reject) => {
			resolve(this._app.details);
		});
	}
}
routes.push(GetApp);

/**
 * @class AddApp
 */
class AddApp extends Route {
	constructor() {
		super('app', 'APP ADD');
		this.verb = Route.Constants.Verbs.POST;
		this.auth = Route.Constants.Auth.SUPER;
		this.permissions = Route.Constants.Permissions.ADD;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.body.name || !req.body.type || !req.body.authLevel) {
				this.log('ERROR: Missing required field', Route.LogLevel.ERR);
				reject({statusCode: 400});
				return;
			}
			if (req.body.type === Model.App.Constants.Type.Browser && !req.body.domain) {
				this.log('ERROR: Missing required field', Route.LogLevel.ERR);
				reject({statusCode: 400});
				return;
			}

			if (!req.body.permissions || req.body.permissions.length === 0) {
				switch (Number(req.body.authLevel)) {
				default:
					req.body.permissions = JSON.stringify([]);
					Logging.logDebug('Creating default permissions');
					break;
				case Model.Token.Constants.AuthLevel.SUPER: {
					const permissions = [
						{route: '*', permission: '*'},
					];
					req.body.permissions = JSON.stringify(permissions);
					Logging.logDebug('Creating default SUPER permissions');
				} break;
				case Model.Token.Constants.AuthLevel.ADMIN: {
					const permissions = [
						{route: '*', permission: '*'},
					];

					req.body.permissions = JSON.stringify(permissions);
					Logging.logDebug('Creating default ADMIN permissions');
				} break;
				}
			}

			try {
				req.body.permissions = JSON.parse(req.body.permissions);
			} catch (e) {
				this.log('ERROR: Badly formed JSON in permissions', Route.LogLevel.ERR);
				reject({statusCode: 400});
				return;
			}
			if (req.body.ownerGroupId) {
				Model.Group.findById(req.body.ownerGroupId)
					.then(Logging.Promise.logProp('Group', 'details', Route.LogLevel.SILLY))
					.then((group) => {
						if (!group) {
							Logging.log('Error: Invalid Group ID', Route.LogLevel.WARN);
							reject({statusCode: 400});
							return;
						}
						resolve(true);
					}, (err) => {
						Logging.log(`Error: Malformed Group ID: ${err.message}`, Route.LogLevel.ERR);
						reject({statusCode: 400});
					});
			} else {
				resolve(true);
			}
		});
	}

	_exec(req, res, validate) {
		return new Promise((resolve, reject) => {
			Model.App.add(req.body)
				.then((res) => Object.assign(res.app, {token: res.token.value}))
				.then(Logging.Promise.logProp('Added App', 'name', Route.LogLevel.INFO))
				.then(resolve, reject);
		});
	}
}
routes.push(AddApp);

/**
 * @class DeleteApp
 */
class DeleteApp extends Route {
	constructor() {
		super('app/:id', 'DELETE APP');
		this.verb = Route.Constants.Verbs.DEL;
		this.auth = Route.Constants.Auth.SUPER;
		this.permissions = Route.Constants.Permissions.WRITE;
		this._app = false;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.params.id) {
				this.log('ERROR: Missing required field', Route.LogLevel.ERR);
				reject({statusCode: 400});
				return;
			}
			Model.App.findById(req.params.id).then((app) => {
				if (!app) {
					this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				this._app = app;
				resolve(true);
			});
		});
	}

	_exec(req, res, validate) {
		return new Promise((resolve, reject) => {
			Model.App.rm(this._app).then(() => true).then(resolve, reject);
		});
	}
}
routes.push(DeleteApp);

/**
 * @class SetAppOwner
 */
class SetAppOwner extends Route {
	constructor() {
		super('app/:id/owner', 'SET APP OWNER');
		this.verb = Route.Constants.Verbs.PUT;
		this.auth = Route.Constants.Auth.SUPER;
		this.permissions = Route.Constants.Permissions.WRITE;

		this._app = false;
		this._group = false;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.body.groupId) {
				this.log('ERROR: Missing required field', Route.LogLevel.ERR);
				reject({statusCode: 400});
				return;
			}

			Model.Group.findById(req.body.groupId).then((group) => {
				if (!group) {
					this.log('ERROR: Invalid Group ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				this._group = group;
			}).then(() => {
				Model.App.findById(req.params.id).then((app) => {
					if (!app) {
						this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
						reject({statusCode: 400});
						return;
					}
					this._app = app;
					resolve(true);
				});
			});
		});
	}

	_exec(req, res, validate) {
		return new Promise((resolve, reject) => {
			this._app.setOwner(this._group).then(() => true).then(resolve, reject);
		});
	}
}
routes.push(SetAppOwner);

/**
 * @class GetAppPermissionList
 */
class GetAppPermissionList extends Route {
	constructor() {
		super('app/:id/permission', 'GET APP PERMISSION LIST');
		this.verb = Route.Constants.Verbs.GET;
		this.auth = Route.Constants.Auth.SUPER;
		this.permissions = Route.Constants.Permissions.LIST;

		this._app = false;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.params.id) {
				this.log('ERROR: Missing required field', Route.LogLevel.ERR);
				reject({statusCode: 400});
				return;
			}
			Model.App.findById(req.params.id).then((app) => {
				if (!app) {
					this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				this._app = app;
				resolve(true);
			});
		});
	}

	_exec(req, res, validate) {
		return new Promise((resolve, reject) => {
			resolve(this._app.permissions.map((p) => {
				return {
					route: p.route,
					permission: p.permission,
				};
			}));
		});
	}
}
routes.push(GetAppPermissionList);

/**
 * @class AddAppPermission
 */
class AddAppPermission extends Route {
	constructor() {
		super('app/:id/permission', 'ADD APP PERMISSION');
		this.verb = Route.Constants.Verbs.PUT;
		this.auth = Route.Constants.Auth.SUPER;
		this.permissions = Route.Constants.Permissions.ADD;

		this._app = false;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			Model.App.findById(req.params.id).then((app) => {
				if (!app) {
					this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}

				if (!req.body.route || !req.body.permission) {
					this.log('ERROR: Missing required field', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}

				this._app = app;
				resolve(true);
			});
		});
	}

	_exec(req, res, validate) {
		return this._app.addOrUpdatePermission(req.body.route, req.body.permission)
			.then((a) => a.details);
	}
}
routes.push(AddAppPermission);

/**
 * @class GetAppSchema
 */
class GetAppSchema extends Route {
	constructor() {
		super('app/schema', 'GET APP SCHEMA');
		this.verb = Route.Constants.Verbs.GET;
		this.auth = Route.Constants.Auth.USER;
		this.permissions = Route.Constants.Permissions.READ;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.authApp) {
				this.log('ERROR: No authenticated app', Route.LogLevel.ERR);
				reject({statusCode: 400, message: 'No authenticated app'});
				return;
			}
			if (!req.authApp.__schema) {
				this.log('ERROR: No app schema defined', Route.LogLevel.ERR);
				reject({statusCode: 400, message: 'No authenticated app schema'});
				return;
			}

			resolve(req.authApp.__schema);
		});
	}

	_exec(req, res, schema) {
		return Schema.buildCollections(Schema.decode(schema));
	}
}
routes.push(GetAppSchema);

/**
 * @class UpdateAppSchema
 */
class UpdateAppSchema extends Route {
	constructor() {
		super('app/schema', 'UPDATE APP SCHEMA');
		this.verb = Route.Constants.Verbs.PUT;
		this.auth = Route.Constants.Auth.ADMIN;
		this.permissions = Route.Constants.Permissions.WRITE;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.authApp) {
				this.log('ERROR: No authenticated app', Route.LogLevel.ERR);
				reject({statusCode: 400, message: 'No authenticated app'});
				return;
			}

			resolve(true);
		});
	}

	_exec(req, res, validate) {
		return Model.App.updateSchema(req.authApp._id, req.body)
			.then(() => true);
	}
}
routes.push(UpdateAppSchema);

/**
 * @class UpdateAppRoles
 */
class UpdateAppRoles extends Route {
	constructor() {
		super('app/roles', 'UPDATE APP ROLES');
		this.verb = Route.Constants.Verbs.PUT;
		this.auth = Route.Constants.Auth.ADMIN;
		this.permissions = Route.Constants.Permissions.WRITE;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			if (!req.authApp) {
				this.log('ERROR: No authenticated app', Route.LogLevel.ERR);
				reject({statusCode: 400, message: 'No authenticated app'});
				return;
			}

			resolve(true);
		});
	}

	_exec(req, res, validate) {
		return Model.App.updateRoles(req.authApp._id, req.body).then((res) => true);
	}
}
routes.push(UpdateAppRoles);

/**
 * @class AddAppMetadata
 */
class AddAppMetadata extends Route {
	constructor() {
		super('app/metadata/:key', 'ADD APP METADATA');
		this.verb = Route.Constants.Verbs.POST;
		this.auth = Route.Constants.Auth.ADMIN;
		this.permissions = Route.Constants.Permissions.ADD;

		this._app = false;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			Model.App.findById(req.appDetails._id).then((app) => {
				if (!app) {
					this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				try {
					JSON.parse(req.body.value);
				} catch (e) {
					this.log(`ERROR: ${e.message}`, Route.LogLevel.ERR);
					this.log(req.body.value, Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}

				this._app = app;
				resolve(true);
			});
		});
	}

	_exec(req, res, validate) {
		return this._app.addOrUpdateMetadata(req.params.key, req.body.value)
			.then((a) => a.details);
	}
}
routes.push(AddAppMetadata);

/**
 * @class UpdateAppMetadata
 */
class UpdateAppMetadata extends Route {
	constructor() {
		super('app/metadata/:key', 'UPDATE APP METADATA');
		this.verb = Route.Constants.Verbs.PUT;
		this.auth = Route.Constants.Auth.ADMIN;
		this.permissions = Route.Constants.Permissions.ADD;

		this._app = false;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			Model.App.findById(req.appDetails._id).then((app) => {
				if (!app) {
					this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				if (app.findMetadata(req.params.key) === false) {
					this.log('ERROR: Metadata does not exist', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				try {
					JSON.parse(req.body.value);
				} catch (e) {
					this.log(`ERROR: ${e.message}`, Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}

				this._app = app;
				resolve(true);
			});
		});
	}

	_exec(req, res, validate) {
		return this._app.addOrUpdateMetadata(req.params.key, req.body.value);
	}
}
routes.push(UpdateAppMetadata);

/**
 * @class GetAppMetadata
 */
class GetAppMetadata extends Route {
	constructor() {
		super('app/metadata/:key', 'GET APP METADATA');
		this.verb = Route.Constants.Verbs.GET;
		this.auth = Route.Constants.Auth.ADMIN;
		this.permissions = Route.Constants.Permissions.GET;

		this._metadata = null;
	}

	_validate(req, res, token) {
		return new Promise((resolve, reject) => {
			Logging.log(`AppID: ${req.appDetails._id}`, Route.LogLevel.DEBUG);
			Model.App.findById(req.appDetails._id).then((app) => {
				if (!app) {
					this.log('ERROR: Invalid App ID', Route.LogLevel.ERR);
					reject({statusCode: 400});
					return;
				}
				this._metadata = app.findMetadata(req.params.key);
				if (this._metadata === false) {
					this.log('WARN: App Metadata Not Found', Route.LogLevel.ERR);
					reject({statusCode: 404});
					return;
				}

				resolve(true);
			});
		});
	}

	_exec(req, res, validate) {
		return this._metadata.value;
	}
}
routes.push(GetAppMetadata);

/**
 * @type {*[]}
 */
module.exports = routes;