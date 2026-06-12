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

describe ('GitHub Actions CI configuration', function () {
    function ReadWorkflow (fileName)
    {
        return fs.readFileSync (
            path.join (__dirname, '..', '.github', 'workflows', fileName),
            'utf8'
        );
    }

    function AssertRunsOnShortWindowsDrive (workflow, scriptName)
    {
        var scriptPattern = new RegExp (
            'subst W: "%GITHUB_WORKSPACE%"[\\s\\S]*W:[\\s\\S]*tools\\\\' + scriptName.replace (/[.*+?^${}()|[\]\\]/g, '\\$&')
        );
        assert.match (
            workflow,
            scriptPattern,
            'Expected ' + scriptName + ' to run from a short W: workspace path.'
        );
    }

    it ('uses the supported upload-artifact action version', function () {
        var nativeBuildWorkflow = ReadWorkflow ('native_build.yml');

        assert.doesNotMatch (
            nativeBuildWorkflow,
            /actions\/upload-artifact@v3/,
            'GitHub Actions hard-fails deprecated upload-artifact@v3 jobs.'
        );
        assert.match (
            nativeBuildWorkflow,
            /actions\/upload-artifact@v4/,
            'Expected native build artifacts to be uploaded with upload-artifact@v4.'
        );
    });

    it ('uses a supported Intel macOS runner image', function () {
        var nativeBuildWorkflow = ReadWorkflow ('native_build.yml');

        assert.doesNotMatch (
            nativeBuildWorkflow,
            /macos-13/,
            'GitHub retired the macos-13 runner image.'
        );
        assert.match (
            nativeBuildWorkflow,
            /macos-15-intel/,
            'Expected the native mac build to use the supported Intel macOS runner.'
        );
        assert.match (
            nativeBuildWorkflow,
            /xcode: \[16\.4\]/,
            'Expected the mac build matrix to select an Xcode version available on macOS 15.'
        );
    });

    it ('runs Windows wasm batch scripts from a short workspace path', function () {
        var wasmBuildWorkflow = ReadWorkflow ('wasm_build.yml');
        var rebuildDistWorkflow = ReadWorkflow ('rebuild_dist.yml');
        var npmPublishWorkflow = ReadWorkflow ('npm_publish.yml');

        AssertRunsOnShortWindowsDrive (wasmBuildWorkflow, 'setup_emscripten_win.bat');
        AssertRunsOnShortWindowsDrive (wasmBuildWorkflow, 'build_wasm_win.bat');
        AssertRunsOnShortWindowsDrive (rebuildDistWorkflow, 'setup_emscripten_win.bat');
        AssertRunsOnShortWindowsDrive (rebuildDistWorkflow, 'build_wasm_win_dist.bat');
        AssertRunsOnShortWindowsDrive (npmPublishWorkflow, 'setup_emscripten_win.bat');
        AssertRunsOnShortWindowsDrive (npmPublishWorkflow, 'build_wasm_win_dist.bat');
    });
});
