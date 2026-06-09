var fs = require ('fs');
var path = require ('path');
var assert = require ('assert');

describe ('Wasm build configuration', function () {
    it ('exports the web build as an ES module', function () {
        var cmakeLists = fs.readFileSync (
            path.join (__dirname, '..', 'CMakeLists.txt'),
            'utf8'
        );
        var emscriptenBlock = cmakeLists.match (/if \(\$\{EMSCRIPTEN\}\)([\s\S]*?)else \(\)/);

        assert (emscriptenBlock, 'Expected to find the EMSCRIPTEN build block.');
        assert (
            emscriptenBlock[1].includes ('target_link_options (OcctImportJS PUBLIC -sENVIRONMENT=web)'),
            'Expected the wasm build to target the web runtime.'
        );
        assert (
            emscriptenBlock[1].includes ('target_link_options (OcctImportJS PUBLIC -sEXPORT_ES6=1)'),
            'Expected the wasm build to export an ES6 module.'
        );
        assert (
            emscriptenBlock[1].includes ('target_link_options (OcctImportJS PUBLIC -sMODULARIZE=1)'),
            'Expected the wasm build to remain modularized.'
        );
    });
});
