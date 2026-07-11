let fs = require ('fs');
let path = require ('path');
let util = require ('util');

async function Main ()
{
    let occtImportJs = (await import ('../dist/occt-import-js.js')).default;
    let occt = await occtImportJs ({
        wasmBinary : fs.readFileSync (
            path.join (__dirname, '..', 'dist', 'occt-import-js.wasm')
        )
    });
    let fileUrl = path.join (
        __dirname,
        '..',
        'test',
        'testfiles',
        'simple-basic-cube',
        'cube.stp'
    );
    let fileContent = fs.readFileSync (fileUrl);
    let result = occt.ReadStepFile (fileContent, null);
    console.log (util.inspect (result, {
        showHidden : false,
        depth : null,
        colors : true
    }));
}

Main ().catch ((error) => {
    console.error (error);
    process.exitCode = 1;
});
