import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PERIODS} from '../data.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const body=app.slice(app.indexOf('function clockValue'),app.indexOf('function normalizeDatabaseTimes'));
const clockValue=new Function('PERIODS',`${body};return clockValue;`)(PERIODS);

test('invalid Google Sheets epoch dates fall back to the official period clock',()=>{
  assert.equal(clockValue('1899-12-30',1,'startTime'),'07:30');
  assert.equal(clockValue('1899-12-30',1,'endTime'),'08:00');
});

test('valid clock and ISO clock values remain readable',()=>{
  assert.equal(clockValue('8:05',2),'08:05');
  assert.equal(clockValue('1899-12-30T10:20:00.000Z',6),'10:20');
});

test('Apps Script formats time columns as clocks instead of dates',()=>{
  const server=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
  assert.match(server,/\/Time\$\/i\.test\(header\) \? "HH:mm" : "yyyy-MM-dd"/);
});
