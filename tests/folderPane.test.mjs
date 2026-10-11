// Unit tests for the folder-pane path helpers. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseName, dirname, paneFolder, samePath } from '../src/lib/utils/folderPane.ts';

test('dirname', () => {
	assert.equal(dirname('C:\\a\\b.md'), 'C:\\a');
	assert.equal(dirname('C:\\b.md'), 'C:\\');
	assert.equal(dirname('/a/b.md'), '/a');
	assert.equal(dirname('/b.md'), '/');
	assert.equal(dirname('\\\\server\\share\\x.md'), '\\\\server\\share');
	assert.equal(dirname('\\\\server\\share\\sub\\x.md'), '\\\\server\\share\\sub');
	assert.equal(dirname('C:/a/b.md'), 'C:/a');
	assert.equal(dirname('b.md'), null);
	assert.equal(dirname(''), null);
});

test('samePath', () => {
	assert.equal(samePath('C:\\Docs\\A', 'c:\\docs\\a'), true);
	assert.equal(samePath('C:\\docs\\a', 'C:/docs/a'), true);
	assert.equal(samePath('C:\\docs\\a\\', 'C:\\docs\\a'), true);
	assert.equal(samePath('C:\\docs\\a', 'C:\\docs\\b'), false);
	assert.equal(samePath('C:\\docs', 'C:\\docs\\a'), false);
});

test('paneFolder', () => {
	assert.equal(paneFolder('D:\\pin', 'C:\\a\\b.md'), 'D:\\pin');
	assert.equal(paneFolder('', 'C:\\a\\b.md'), 'C:\\a');
	assert.equal(paneFolder(null, 'C:\\a\\b.md'), 'C:\\a');
	assert.equal(paneFolder(null, 'C:\\x\\c.md'), 'C:\\x');
	assert.equal(paneFolder(null, null), null);
	assert.equal(paneFolder(null, undefined), null);
	assert.equal(paneFolder(null, ''), null);
	// untitled / home tabs have no folder
	assert.equal(paneFolder(null, 'Untitled-1'), null);
});

test('baseName', () => {
	assert.equal(baseName('C:\\a\\b.md'), 'b.md');
	assert.equal(baseName('C:\\a\\docs'), 'docs');
	assert.equal(baseName('C:\\a\\docs\\'), 'docs');
	assert.equal(baseName('/a/b.md'), 'b.md');
	assert.equal(baseName('C:\\'), 'C:\\');
	assert.equal(baseName('\\\\server\\share'), 'share');
	assert.equal(baseName('\\\\server\\share\\x.md'), 'x.md');
	assert.equal(baseName('b.md'), 'b.md');
});
