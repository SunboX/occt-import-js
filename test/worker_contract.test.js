var fs = require ('fs');
var os = require ('os');
var path = require ('path');
var vm = require ('vm');
var assert = require ('assert');
var url = require ('url');

function ReadWorkerSource ()
{
    return fs.readFileSync (
        path.join (__dirname, '..', 'src', 'occt-import-js-worker.js'),
        'utf8'
    );
}

function CreateWorkerHarness (options)
{
    var settings = options || {};
    var workerSource = ReadWorkerSource ();
    var importFailuresRemaining = settings.importFailures || 0;
    var fetchFailuresRemaining = settings.fetchFailures || 0;
    var importedUrls = [];
    var fetchRequests = [];
    var factoryOptions = [];
    var readCalls = [];
    var postedMessages = [];
    var reportedErrors = [];
    var createOcct = async function (moduleOptions) {
        factoryOptions.push (moduleOptions);
        return {
            ReadFile : function (format, buffer, params) {
                var call = { format : format, buffer : buffer, params : params };
                readCalls.push (call);
                if (settings.readError) {
                    throw settings.readError;
                }
                return {
                    success : true,
                    format : format,
                    byteLength : buffer.byteLength,
                    callCount : readCalls.length
                };
            }
        };
    };
    var executableSource = workerSource.replace (
        /import\s*\(\s*importerUrl\.href\s*\)/,
        'ImportModule (importerUrl.href)'
    );
    assert.notStrictEqual (
        executableSource,
        workerSource,
        'Expected the worker harness to intercept its one dynamic import.'
    );

    var workerSelf = {
        location : {
            href : 'https://example.test/vendor/occt-import-js-worker.js?v=1.2.0'
        },
        reportError : function (error) {
            reportedErrors.push (error);
        }
    };
    var context = vm.createContext ({
        URL : URL,
        self : workerSelf,
        fetch : async function (url, fetchOptions) {
            fetchRequests.push ({ url : String (url), options : fetchOptions });
            if (fetchFailuresRemaining > 0) {
                fetchFailuresRemaining -= 1;
                return {
                    ok : false,
                    status : 503,
                    url : String (url),
                    arrayBuffer : async function () {
                        return new ArrayBuffer (0);
                    }
                };
            }
            return {
                ok : true,
                status : 200,
                url : String (url),
                arrayBuffer : async function () {
                    return new Uint8Array ([0, 97, 115, 109]).buffer;
                }
            };
        },
        postMessage : function (message) {
            postedMessages.push (message);
        },
        ImportModule : async function (specifier) {
            importedUrls.push (String (specifier));
            if (importFailuresRemaining > 0) {
                importFailuresRemaining -= 1;
                throw new Error ('Importer module failed to load.');
            }
            return { default : createOcct };
        },
        setTimeout : setTimeout,
        clearTimeout : clearTimeout
    });
    var script = new vm.Script (executableSource, {
        filename : 'occt-import-js-worker.js'
    });
    script.runInContext (context);

    return {
        context : context,
        importedUrls : importedUrls,
        fetchRequests : fetchRequests,
        factoryOptions : factoryOptions,
        readCalls : readCalls,
        postedMessages : postedMessages,
        reportedErrors : reportedErrors,
        dispose : function () {}
    };
}

describe ('Browser worker distribution', function () {
    it ('keeps shipped examples on the ESM entrypoint', function () {
        var exampleNames = [
            'node_step.js',
            'stp_to_obj.js',
            'browser_step.html',
            'three_viewer.html'
        ];
        var examples = Object.fromEntries (exampleNames.map (function (name) {
            return [
                name,
                fs.readFileSync (
                    path.join (__dirname, '..', 'examples', name),
                    'utf8'
                )
            ];
        }));

        assert.doesNotMatch (
            examples['node_step.js'],
            /\brequire\s*\(\s*['"]\.\.\/dist\/occt-import-js\.js/
        );
        assert.doesNotMatch (
            examples['stp_to_obj.js'],
            /\brequire\s*\(\s*['"]\.\.\/dist\/occt-import-js\.js/
        );
        assert.match (
            examples['node_step.js'],
            /await import\s*\(\s*'\.\.\/dist\/occt-import-js\.js'\s*\)/
        );
        assert.match (
            examples['stp_to_obj.js'],
            /await import\s*\(\s*'\.\.\/dist\/occt-import-js\.js'\s*\)/
        );
        for (var htmlName of ['browser_step.html', 'three_viewer.html']) {
            assert.doesNotMatch (
                examples[htmlName],
                /<script[^>]+src="\.\.\/dist\/occt-import-js\.js"/
            );
            assert.match (examples[htmlName], /<script type=['"]module['"]>/);
            assert.match (
                examples[htmlName],
                /import occtImportJs from '\.\.\/dist\/occt-import-js\.js'/
            );
        }
    });

    it ('marks the generated package entrypoint as ESM', async function () {
        var sourcePackagePath = path.join (
            __dirname,
            '..',
            'src',
            'dist-package.json'
        );
        var builtModulePath = path.join (
            __dirname,
            '..',
            'build',
            'wasm',
            'Release',
            'occt-import-js.js'
        );
        var packageFixturePath = fs.mkdtempSync (
            path.join (os.tmpdir (), 'occt-import-js-esm-entrypoint-')
        );
        var packagePath = path.join (packageFixturePath, 'package.json');
        var modulePath = path.join (packageFixturePath, 'occt-import-js.js');

        try {
            var packageMetadata = JSON.parse (
                fs.readFileSync (sourcePackagePath, 'utf8')
            );
            assert.deepStrictEqual (packageMetadata, { type : 'module' });
            fs.copyFileSync (sourcePackagePath, packagePath);
            fs.copyFileSync (builtModulePath, modulePath);

            var imported = await import (
                url.pathToFileURL (modulePath).href + '?entrypoint-contract'
            );
            assert.strictEqual (typeof imported.default, 'function');
        } finally {
            fs.rmSync (packageFixturePath, { recursive : true, force : true });
        }
    });

    it ('loads the ESM importer without classic importScripts', function () {
        var workerSource = ReadWorkerSource ();

        assert.doesNotMatch (workerSource, /\bimportScripts\s*\(/);
        assert.match (workerSource, /\bimport\s*\(\s*importerUrl\.href\s*\)/);
        assert.match (
            workerSource,
            /module\?\.default\s*\|\|\s*module\?\.occtimportjs/
        );
    });

    it ('caches the importer and wasm while preserving asset query parameters', async function () {
        var harness = CreateWorkerHarness ();
        var firstBuffer = new Uint8Array ([1, 2, 3]);
        var secondBuffer = new Uint8Array ([4, 5]);
        var firstParams = { linearUnit : 'inch' };

        try {
            await harness.context.onmessage ({
                data : {
                    format : 'step',
                    buffer : firstBuffer,
                    params : firstParams
                }
            });
            await harness.context.onmessage ({
                data : {
                    format : 'step',
                    buffer : secondBuffer,
                    params : null
                }
            });

            assert.deepStrictEqual (harness.importedUrls, [
                'https://example.test/vendor/occt-import-js.js?v=1.2.0'
            ]);
            assert.strictEqual (harness.fetchRequests.length, 1);
            assert.strictEqual (
                harness.fetchRequests[0].url,
                'https://example.test/vendor/occt-import-js.wasm?v=1.2.0'
            );
            assert.strictEqual (
                harness.fetchRequests[0].options.credentials,
                'same-origin'
            );
            assert.deepStrictEqual (
                Object.keys (harness.fetchRequests[0].options),
                ['credentials']
            );
            assert.strictEqual (harness.factoryOptions.length, 1);
            assert.strictEqual (
                harness.factoryOptions[0].wasmBinary.byteLength,
                4
            );
            assert.strictEqual (
                harness.factoryOptions[0].locateFile ('sidecar.bin'),
                'https://example.test/vendor/sidecar.bin?v=1.2.0'
            );
            assert.strictEqual (harness.readCalls.length, 2);
            assert.strictEqual (harness.readCalls[0].format, 'step');
            assert.strictEqual (harness.readCalls[0].buffer, firstBuffer);
            assert.strictEqual (harness.readCalls[0].params, firstParams);
            assert.strictEqual (harness.readCalls[1].buffer, secondBuffer);
            assert.deepStrictEqual (harness.postedMessages, [
                {
                    success : true,
                    format : 'step',
                    byteLength : 3,
                    callCount : 1
                },
                {
                    success : true,
                    format : 'step',
                    byteLength : 2,
                    callCount : 2
                }
            ]);
            assert.deepStrictEqual (harness.reportedErrors, []);
        } finally {
            harness.dispose ();
        }
    });

    it ('reports initialization errors and retries the failed resource', async function () {
        var harness = CreateWorkerHarness ({ fetchFailures : 1 });

        try {
            await harness.context.onmessage ({
                data : {
                    format : 'step',
                    buffer : new Uint8Array ([1]),
                    params : null
                }
            });

            assert.strictEqual (harness.postedMessages.length, 0);
            assert.strictEqual (harness.reportedErrors.length, 1);
            assert.match (
                String (harness.reportedErrors[0].message),
                /Failed to load wasm: 503/
            );

            await harness.context.onmessage ({
                data : {
                    format : 'step',
                    buffer : new Uint8Array ([2]),
                    params : null
                }
            });

            assert.strictEqual (harness.importedUrls.length, 1);
            assert.strictEqual (harness.fetchRequests.length, 2);
            assert.strictEqual (harness.factoryOptions.length, 1);
            assert.strictEqual (harness.readCalls.length, 1);
            assert.deepStrictEqual (harness.postedMessages, [
                {
                    success : true,
                    format : 'step',
                    byteLength : 1,
                    callCount : 1
                }
            ]);
        } finally {
            harness.dispose ();
        }
    });
});
