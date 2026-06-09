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
});
