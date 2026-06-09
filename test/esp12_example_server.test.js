var assert = require ('assert');
var http = require ('http');
var path = require ('path');

var createStaticServer = require ('../examples/esp12_viewer/server.js').createStaticServer;

function Get (baseUrl, pathname)
{
    return new Promise (function (resolve, reject) {
        http.get (baseUrl + pathname, function (response) {
            var chunks = [];
            response.on ('data', function (chunk) {
                chunks.push (chunk);
            });
            response.on ('end', function () {
                resolve ({
                    statusCode : response.statusCode,
                    headers : response.headers,
                    body : Buffer.concat (chunks)
                });
            });
        }).on ('error', reject);
    });
}

describe ('ESP_12 example server', function () {
    var server = null;
    var baseUrl = null;

    before (function (done) {
        server = createStaticServer ({
            rootDir : path.resolve (__dirname, '..'),
            log : false
        });
        server.listen (0, '127.0.0.1', function () {
            baseUrl = 'http://127.0.0.1:' + server.address ().port;
            done ();
        });
    });

    after (function (done) {
        server.close (done);
    });

    it ('serves the viewer html from the example route', async function () {
        var response = await Get (baseUrl, '/examples/esp12_viewer/');

        assert.strictEqual (response.statusCode, 200);
        assert.match (response.headers['content-type'], /^text\/html/);
        assert.match (response.body.toString ('utf8'), /ESP_12/);
        assert.match (response.body.toString ('utf8'), /occt-import-js/);
    });

    it ('serves wasm with the required mime type', async function () {
        var response = await Get (baseUrl, '/dist/occt-import-js.wasm');

        assert.strictEqual (response.statusCode, 200);
        assert.match (response.headers['content-type'], /^application\/wasm/);
    });

    it ('serves the bundled ESP_12 step model', async function () {
        var response = await Get (baseUrl, '/examples/esp12_viewer/ESP_12.step');

        assert.strictEqual (response.statusCode, 200);
        assert.match (response.headers['content-type'], /^model\/step/);
        assert.strictEqual (Number (response.headers['content-length']), 5280643);
    });
});
