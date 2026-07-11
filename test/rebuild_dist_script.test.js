var fs = require ('fs');
var path = require ('path');
var assert = require ('assert');

describe ('Distribution rebuild script', function () {
    it ('runs through the node platform wrapper', function () {
        var packageJson = JSON.parse (fs.readFileSync (
            path.join (__dirname, '..', 'package.json'),
            'utf8'
        ));

        assert.strictEqual (
            packageJson.scripts['rebuild:dist'],
            'node tools/rebuild_dist.js'
        );
    });

    it ('uses the Windows batch file on Windows and the shell script elsewhere', function () {
        var wrapperPath = path.join (__dirname, '..', 'tools', 'rebuild_dist.js');
        assert (fs.existsSync (wrapperPath), 'Expected tools/rebuild_dist.js to exist.');

        var rebuildDist = require (wrapperPath);
        assert.deepStrictEqual (
            rebuildDist.GetRebuildDistCommand ('win32'),
            {
                command : 'cmd.exe',
                args : ['/d', '/s', '/c', 'tools\\build_wasm_win_dist.bat']
            }
        );
        assert.deepStrictEqual (
            rebuildDist.GetRebuildDistCommand ('darwin'),
            {
                command : 'bash',
                args : [path.join ('tools', 'build_wasm_dist.sh')]
            }
        );
    });

    it ('copies the browser worker into every rebuilt distribution', function () {
        var shellScript = fs.readFileSync (
            path.join (__dirname, '..', 'tools', 'build_wasm_dist.sh'),
            'utf8'
        );
        var windowsScript = fs.readFileSync (
            path.join (__dirname, '..', 'tools', 'build_wasm_win_dist.bat'),
            'utf8'
        );

        assert.match (
            shellScript,
            /cp src\/occt-import-js-worker\.js dist\/occt-import-js-worker\.js/
        );
        assert.match (
            windowsScript,
            /copy src\\occt-import-js-worker\.js dist\\occt-import-js-worker\.js/
        );
        assert.match (
            shellScript,
            /cp src\/dist-package\.json dist\/package\.json/
        );
        assert.match (
            windowsScript,
            /copy src\\dist-package\.json dist\\package\.json/
        );
        assert.match (
            shellScript,
            /cp occt\/OCCT_LGPL_EXCEPTION\.txt dist\/OCCT_LGPL_EXCEPTION\.txt/
        );
        assert.match (
            windowsScript,
            /copy occt\\OCCT_LGPL_EXCEPTION\.txt dist\\OCCT_LGPL_EXCEPTION\.txt/
        );
    });
});
