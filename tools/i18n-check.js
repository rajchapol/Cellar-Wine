#!/usr/bin/env node
// Lists Thai text in index.html that English mode can't translate:
//   1) Thai string literals / template text NOT wrapped in T() or TA()
//   2) T("…") keys that have no entry in the EN dictionary
// Usage:  npm i --no-save acorn@8 acorn-walk@8 && node tools/i18n-check.js
// To fix: wrap new Thai text as T('ข้อความ') (or ${T('ข้อความ')} inside a
// template) and add  "ข้อความ": "English text",  to the EN object at the top
// of the <script> in index.html.
const fs = require('fs'), path = require('path');
const acorn = require('acorn'), walk = require('acorn-walk');
const file = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(file, 'utf8');
const a = src.lastIndexOf('<script>') + 8, b = src.lastIndexOf('</script>');
const js = src.slice(a, b);
const TH = /[฀-฾เ-๿]/;            // Thai, ignoring the ฿ sign
const ast = acorn.parse(js, { ecmaVersion: 2022 });
const lineOf = pos => src.slice(0, a + pos).split('\n').length;

// the EN dictionary object
let EN = null;
walk.simple(ast, { VariableDeclarator(n) {
  if (n.id.name === 'EN' && n.init && n.init.type === 'ObjectExpression') {
    EN = {}; n.init.properties.forEach(p => { EN[p.key.value] = p.value.value; });
  }
}});
if (!EN) { console.error('EN dictionary not found'); process.exit(2); }

const unwrapped = [], missing = [];
walk.fullAncestor(ast, (node, _s, anc) => {
  const parent = anc[anc.length - 2];
  const inT = parent && parent.type === 'CallExpression' && parent.callee.type === 'Identifier' && /^(T|TA)$/.test(parent.callee.name);
  if (node.type === 'Literal' && typeof node.value === 'string' && TH.test(node.value)) {
    // the EN dictionary itself is data, not UI text
    if (anc.some(x => x.type === 'VariableDeclarator' && x.id.name === 'EN')) return;
    if (parent && parent.type === 'Property' && parent.key === node) return;
    if (inT) { if (!(node.value in EN)) missing.push([lineOf(node.start), node.value]); }
    else unwrapped.push([lineOf(node.start), node.value]);
  }
  if (node.type === 'TemplateElement' && TH.test(node.value.cooked || '')) unwrapped.push([lineOf(node.start), node.value.cooked.trim()]);
});
const show = (title, list) => { console.log(`${title}: ${list.length}`); list.slice(0, 80).forEach(([l, t]) => console.log(`  line ${l}: ${JSON.stringify(t).slice(0, 110)}`)); };
show('Thai text not wrapped in T()', unwrapped);
show('T() keys missing from EN', missing);
process.exit(unwrapped.length || missing.length ? 1 : 0);
