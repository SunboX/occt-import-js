var path = require ('path');
var createSharedStaticServer = require ('../static_server.js').createStaticServer;

var DefaultRoute = '/examples/ft601q_viewer/';

function createStaticServer (options)
{
    options = options || {};
    return createSharedStaticServer ({
        rootDir : options.rootDir || path.resolve (__dirname, '../..'),
        defaultRoute : options.defaultRoute || DefaultRoute
    });
}

if (require.main === module) {
    var port = Number (process.env.PORT || 8091);
    var host = process.env.HOST || '127.0.0.1';
    var server = createStaticServer ();
    server.listen (port, host, function () {
        var address = 'http://' + host + ':' + port + DefaultRoute;
        console.log ('Serving FT601Q viewer at ' + address);
    });
}

module.exports = {
    createStaticServer : createStaticServer
};
