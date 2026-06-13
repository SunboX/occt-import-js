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

    it ('disables Windows min/max macros for MSVC native builds', function () {
        var cmakeLists = fs.readFileSync (
            path.join (__dirname, '..', 'CMakeLists.txt'),
            'utf8'
        );

        assert.match (
            cmakeLists,
            /target_compile_definitions\s*\(\s*OcctImportJS[\s\S]*NOMINMAX/,
            'Expected MSVC builds to define NOMINMAX before compiling OCCT Windows sources.'
        );
    });

    it ('links Windows native builds against Winsock', function () {
        var cmakeLists = fs.readFileSync (
            path.join (__dirname, '..', 'CMakeLists.txt'),
            'utf8'
        );

        assert.match (
            cmakeLists,
            /target_link_libraries\s*\(\s*OcctImportJS[\s\S]*ws2_32/,
            'Expected Windows native builds to link Winsock for OCCT socket helpers.'
        );
    });
});

describe ('Package metadata', function () {
    it ('targets the SunboX GitHub package scope and registry', function () {
        var packageJson = JSON.parse (fs.readFileSync (
            path.join (__dirname, '..', 'package.json'),
            'utf8'
        ));

        assert.strictEqual (packageJson.name, '@sunbox/occt-import-js');
        assert.deepStrictEqual (packageJson.repository, {
            type: 'git',
            url: 'git+https://github.com/SunboX/occt-import-js.git'
        });
        assert.strictEqual (
            packageJson.publishConfig.registry,
            'https://npm.pkg.github.com'
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

    it ('limits Windows native build parallelism to avoid MSVC heap exhaustion', function () {
        var nativeBuildWorkflow = ReadWorkflow ('native_build.yml');

        assert.match (
            nativeBuildWorkflow,
            /cmake --build build[\\\/]\$\{\{matrix\.toolset\}\}(?: --config \$\{\{matrix\.configuration\}\})? --parallel 1/,
            'Expected Windows native builds to compile serially on GitHub-hosted runners.'
        );
    });

    it ('uses Ninja for Windows native builds to avoid Visual Studio compiler batching', function () {
        var nativeBuildWorkflow = ReadWorkflow ('native_build.yml');

        assert.match (
            nativeBuildWorkflow,
            /fail-fast: false/,
            'Expected native matrix jobs to keep running after one toolset fails.'
        );
        assert.match (
            nativeBuildWorkflow,
            /vcvars64\.bat/,
            'Expected Windows native builds to enter an MSVC developer environment.'
        );
        assert.match (
            nativeBuildWorkflow,
            /-G Ninja/,
            'Expected Windows native builds to use Ninja instead of the Visual Studio generator.'
        );
        assert.match (
            nativeBuildWorkflow,
            /CMAKE_NINJA_FORCE_RESPONSE_FILE=ON/,
            'Expected Ninja builds to use response files for the large OCCT compile commands.'
        );
        assert.doesNotMatch (
            nativeBuildWorkflow,
            /Visual Studio 17 2022/,
            'Expected Windows native builds to avoid Visual Studio project compiler batching.'
        );
        assert.match (
            nativeBuildWorkflow,
            /CMAKE_ARCHIVE_OUTPUT_DIRECTORY=.*build[\\\/]\$\{\{matrix\.toolset\}\}[\\\/]\$\{\{matrix\.configuration\}\}/,
            'Expected Ninja builds to keep the uploaded .lib artifact path stable.'
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

    it ('publishes the scoped package to GitHub Packages instead of npmjs', function () {
        var npmPublishWorkflow = ReadWorkflow ('npm_publish.yml');

        assert.match (
            npmPublishWorkflow,
            /name:\s*GitHub Packages Publish/,
            'Expected the package publish workflow to target GitHub Packages.'
        );
        assert.match (
            npmPublishWorkflow,
            /packages:\s*write/,
            'Expected the workflow token to have package publish permission.'
        );
        assert.match (
            npmPublishWorkflow,
            /registry-url:\s*'https:\/\/npm\.pkg\.github\.com'/,
            'Expected setup-node to target the GitHub Packages npm registry.'
        );
        assert.match (
            npmPublishWorkflow,
            /scope:\s*'@sunbox'/,
            'Expected setup-node to configure the @sunbox scope.'
        );
        assert.match (
            npmPublishWorkflow,
            /npm publish --registry=https:\/\/npm\.pkg\.github\.com/,
            'Expected package publication to go to GitHub Packages.'
        );
        assert.match (
            npmPublishWorkflow,
            /NODE_AUTH_TOKEN:\s*\$\{\{secrets\.GITHUB_TOKEN\}\}/,
            'Expected publication to authenticate with the repository GITHUB_TOKEN.'
        );
        assert.doesNotMatch (
            npmPublishWorkflow,
            /registry\.npmjs\.org|NPM_TOKEN/,
            'Expected the workflow not to publish to the public npm registry.'
        );
    });

    it ('uploads release build assets when a release is published', function () {
        var nativeBuildWorkflow = ReadWorkflow ('native_build.yml');
        var rebuildDistWorkflow = ReadWorkflow ('rebuild_dist.yml');

        assert.match (
            nativeBuildWorkflow,
            /release:[\s\S]*types:\s*\[published\]/,
            'Expected native builds to run for published releases.'
        );
        assert.match (
            rebuildDistWorkflow,
            /release:[\s\S]*types:\s*\[published\]/,
            'Expected dist rebuilds to run for published releases.'
        );
        assert.match (
            nativeBuildWorkflow,
            /native-\$\{\{matrix\.toolset\}\}-\$\{\{matrix\.configuration\}\}\.zip[\s\S]*gh release upload \$env:RELEASE_TAG \$assetName --clobber/,
            'Expected Windows native release assets to be uploaded to the release.'
        );
        assert.match (
            nativeBuildWorkflow,
            /native-xcode-\$\{\{matrix\.xcode\}\}-\$\{\{matrix\.configuration\}\}\.zip[\s\S]*gh release upload "\$RELEASE_TAG" "\$asset_name" --clobber/,
            'Expected macOS native release assets to be uploaded to the release.'
        );
        assert.match (
            nativeBuildWorkflow,
            /headers\.zip[\s\S]*gh release upload "\$RELEASE_TAG" "\$asset_name" --clobber/,
            'Expected header release assets to be uploaded to the release.'
        );
        assert.match (
            rebuildDistWorkflow,
            /dist\.zip[\s\S]*gh release upload \$env:RELEASE_TAG \$assetName --clobber/,
            'Expected dist release assets to be uploaded to the release.'
        );
    });
});
