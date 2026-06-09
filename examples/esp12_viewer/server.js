var fs = require ('fs');
var http = require ('http');
var path = require ('path');
var url = require ('url');

var MimeTypes = {
    '.html' : 'text/html; charset=utf-8',
    '.js' : 'application/javascript; charset=utf-8',
    '.mjs' : 'application/javascript; charset=utf-8',
    '.css' : 'text/css; charset=utf-8',
    '.json' : 'application/json; charset=utf-8',
    '.wasm' : 'application/wasm',
    '.step' : 'model/step',
    '.stp' : 'model/step',
    '.png' : 'image/png',
    '.jpg' : 'image/jpeg',
    '.jpeg' : 'image/jpeg',
    '.svg' : 'image/svg+xml'
};

function IsPathInside (rootDir, filePath)
{
    var relativePath = path.relative (rootDir, filePath);
    return relativePath === '' || (
        relativePath.indexOf ('..') !== 0 &&
        !path.isAbsolute (relativePath)
    );
}

function SendText (response, statusCode, text)
{
    response.writeHead (statusCode, {
        'content-type' : 'text/plain; charset=utf-8',
        'content-length' : Buffer.byteLength (text)
    });
    response.end (text);
}

function SendRedirect (response, location)
{
    response.writeHead (302, {
        'location' : location,
        'content-length' : 0
    });
    response.end ();
}

function ResolveFilePath (rootDir, requestPath)
{
    var decodedPath = decodeURIComponent (requestPath);
    var normalizedPath = path.normalize (decodedPath).replace (/^(\.\.[/\\])+/, '');
    var filePath = path.join (rootDir, normalizedPath);

    if (decodedPath.charAt (decodedPath.length - 1) === '/') {
        filePath = path.join (filePath, 'index.html');
    }

    return filePath;
}

function ServeFile (rootDir, request, response)
{
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        SendText (response, 405, 'Method Not Allowed');
        return;
    }

    var parsedUrl = url.parse (request.url);
    if (parsedUrl.pathname === '/') {
        SendRedirect (response, '/examples/esp12_viewer/');
        return;
    }

    var filePath = null;
    try {
        filePath = ResolveFilePath (rootDir, parsedUrl.pathname);
    } catch (error) {
        SendText (response, 400, 'Bad Request');
        return;
    }

    if (!IsPathInside (rootDir, filePath)) {
        SendText (response, 403, 'Forbidden');
        return;
    }

    fs.stat (filePath, function (statError, stat) {
        if (statError) {
            SendText (response, 404, 'Not Found');
            return;
        }

        var resolvedPath = filePath;
        var resolvedStat = stat;
        if (stat.isDirectory ()) {
            resolvedPath = path.join (filePath, 'index.html');
            try {
                resolvedStat = fs.statSync (resolvedPath);
            } catch (directoryError) {
                SendText (response, 404, 'Not Found');
                return;
            }
        }

        if (!IsPathInside (rootDir, resolvedPath)) {
            SendText (response, 403, 'Forbidden');
            return;
        }

        var extension = path.extname (resolvedPath).toLowerCase ();
        response.writeHead (200, {
            'content-type' : MimeTypes[extension] || 'application/octet-stream',
            'content-length' : resolvedStat.size,
            'cache-control' : 'no-store'
        });

        if (request.method === 'HEAD') {
            response.end ();
            return;
        }

        fs.createReadStream (resolvedPath).pipe (response);
    });
}

function createStaticServer (options)
{
    options = options || {};
    var rootDir = path.resolve (options.rootDir || path.resolve (__dirname, '../..'));

    return http.createServer (function (request, response) {
        ServeFile (rootDir, request, response);
    });
}

if (require.main === module) {
    var port = Number (process.env.PORT || 8090);
    var host = process.env.HOST || '127.0.0.1';
    var server = createStaticServer ();
    server.listen (port, host, function () {
        var address = 'http://' + host + ':' + port + '/examples/esp12_viewer/';
        console.log ('Serving ESP_12 viewer at ' + address);
    });
}

module.exports = {
    createStaticServer : createStaticServer
};
