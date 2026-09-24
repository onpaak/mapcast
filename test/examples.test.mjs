import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generate} from '../src/scene.mjs';
import {concreteCity} from '../src/concrete-city.mjs';

// The bundled examples are the first thing a new user runs (npm run demo, npm run demo:urban).
for(const name of ['block','urban-block'])test(`the ${name} example generates`,()=>{
  const data=JSON.parse(readFileSync(new URL(`../examples/${name}.json`,import.meta.url),'utf8'));
  const scene=concreteCity(generate(data));
  assert.ok(scene.objects.some(o=>o.name.startsWith('Building_')));
});
