//https://github.com/pouchdb/pouchdb-server/blob/master/bin/pouchdb-server

var express = require('express'),
	corser = require('corser'),
	path = require('path'),
	mkdirp = require('mkdirp'),
	argv = require('optimist').argv,
	port = +(argv.p || argv.port || 5984),
	logger = argv.l || argv.log || 'dev',
	user = argv.u || argv.user,
	pass = argv.s || argv.pass,
	dbpath = argv.d || argv.dir || argv.directory || '',
	inMem = argv.m || argv['in-memory'],
	useAuth = user && pass,
	app = express(),
	corserRequestListener = corser.create({
		methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
		supportsCredentials: true
	});

// Help, display usage information
if (argv.h || argv.help) {
	var path = require('path'),
		fs = require('fs'),
		fp = path.resolve(__dirname, 'usage.txt'),
		usage = fs.readFileSync(fp, 'utf8');

	process.stdout.write(usage);
	process.exit(1);
}

//app.use(require('morgan')(logger));
app.use(function (req, res, next) {
	corserRequestListener(req, res, function () {
		if (req.method == 'OPTIONS') {
			// End CORS preflight request.
			res.writeHead(204);
			return res.end();
		}
		next();
	});
});

if (useAuth) {
	app.all('*', function (req, res, next) {
		var auth = req.headers.authorization;
		// Default read-only
		if (req.user || req.method === 'GET') return next();
		// Otherwise authenticate
		if (!auth) return res.send(401);

		var parts = auth.split(' ');
		if (parts.length !== 2) return res.send(400);
		var scheme = parts[0],
			credentials = new Buffer(parts[1], 'base64').toString(),
			index = credentials.indexOf(':');

		if (scheme !== 'Basic' || index < 0) return res.send(400);

		var reqUser = credentials.slice(0, index),
			reqPass = credentials.slice(index + 1);

		if (reqUser == user && reqPass == pass) return next();
		res.send(401);
	});
}

var expressPouchDB = require('express-pouchdb');
var opts = {};
if (dbpath) {
	opts.prefix = path.resolve(dbpath) + path.sep;
	mkdirp.sync(opts.prefix);
}
if (inMem) {
	opts.db = require('memdown');
}

var PouchDB = require('pouchdb').defaults(opts);
app.use(expressPouchDB(PouchDB));
app.listen(port, function () {
	console.log('\npouchdb-server listening on port ' + port + '.');
	if (inMem) {
		console.log('database is in-memory; no changes will be saved.');
	} else if (dbpath) {
		console.log('database files will be saved to ' + opts.prefix);
	}
	console.log('\nnavigate to http://localhost:' + port + '/_utils for the Fauxton UI.\n');
}).on('error', function (e) {
	if (e.code === 'EADDRINUSE') {
		console.error('\nError: Port ' + port + ' is already in use.')
		console.error('Try another one, e.g. pouchdb-server -p ' +
			(parseInt(port) + 1) + '\n');
	} else {
		console.error('Uncaught error: ' + e);
		console.error(e.stack);
	}
});


process.on('SIGINT', function () {
	process.exit(0)
});


var network = "netention";
var database = network || "main";

var T = new(require('telepathine').Telepathine)(
	10000, [], {
		network: network
	}
);

T.on('start', function () {
	console.log('telepathine p2p started on port ' + T.port);
});


new PouchDB(database, function (err, db) {
	if (err) {
		console.error(err);
		process.exit(0);
	}

	db.info(function (err, info) {
				
		db.changes({
			since: info.update_seq,
			live: true,
			include_docs: true
		}).on('change', function (c) {
			var x = c.doc;
			var i = x._id;
			var ip = i.indexOf('_');
			
			var peer;
			if (ip == -1) {
				peer = T.peer_name;
			}
			else {
				peer = i.substring(0, ip);
			}
				
			//console.log('change from ', peer, ' key=', x.id);
			
			if (peer == T.peer_name) {
				//console.log('  change was created locally');
				
				//broadcast				
				var key = x.id || x._id;				
				T.set(key, x);
				
				//console.log('setting', key, x);
			}
			
		});
	});
		
	T.on('set', function (peer, k, v) {
		if (peer == T.peer_name) return;
		
		if (!(typeof v == "object")) {
			v = { value: v };
		}
				
		v._id = peer + '_' + k;
		v.id = k;		
		delete v._tag;
		
		db.get(v._id, function(err, otherDoc) {
			if (otherDoc) {
				v._rev = otherDoc._rev;
			}
			
			db.put(v, function callback(err, result) {
				if (err) console.error(err);			
			});			
		});
				
	});
	
	T.start();
	
});



