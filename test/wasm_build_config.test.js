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

    it ('copies import file bytes through a typed array memory view', function () {
        var jsInterface = fs.readFileSync (
            path.join (__dirname, '..', 'occt-import-js', 'src', 'js-interface.cpp'),
            'utf8'
        );

        assert (
            jsInterface.includes ('CopyUint8Array'),
            'Expected a dedicated Uint8Array copy helper.'
        );
        assert (
            jsInterface.includes ('typed_memory_view (bufferArr.size (), bufferArr.data ())'),
            'Expected the helper to expose the destination vector as a typed memory view.'
        );
        assert (
            jsInterface.includes ('.call<void> ("set",'),
            'Expected the helper to use Uint8Array.set for bulk copying.'
        );
        assert.doesNotMatch (
            jsInterface,
            /vecFromJSArray/,
            'Expected the hot import path to avoid per-element embind conversion.'
        );
    });
});
