import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreActivity, severityForScore } from '../src/fraud/scoring.js';
import { fraudRules } from '../src/fraud/rules.js';

test('severity bands use exact 0/30/60/80/100 boundaries', () => {
  for (const [score, severity] of [[0,'LOW'],[29,'LOW'],[30,'MEDIUM'],[59,'MEDIUM'],[60,'HIGH'],[79,'HIGH'],[80,'CRITICAL'],[100,'CRITICAL']]) assert.equal(severityForScore(score),severity);
  for (const bad of [-1,101,NaN,Infinity,29.5,'60']) assert.throws(() => severityForScore(bad));
});
test('ordinary activity scores zero and no rule fires', () => {
  const result=scoreActivity({ bookingsLast10Minutes: 3, bookingsLast24Hours: 3 });
  assert.equal(result.score,0); assert.equal(result.severity,'LOW'); assert.deepEqual(fraudRules(result.metrics),[]);
});
test('worked example reconstructs a HIGH score from explicit contributions', () => {
  const result=scoreActivity({ bookingsLast10Minutes: 12, paymentFailuresLast30Minutes: 3, bookingsLast24Hours: 10, cancellationsLast24Hours: 6 });
  assert.equal(result.score,65); assert.equal(result.severity,'HIGH'); assert.equal(result.rawScore,65);
  assert.deepEqual(result.contributions.map(c=>c.points),[20,0,30,0,15,0]);
  assert.match(result.explanation,/12 booking attempts/); assert.match(result.explanation,/3 demo provider declines/); assert.match(result.explanation,/6 cancellations/);
});
test('one duplicate presentation produces HIGH; repeated presentations can become CRITICAL', () => {
  assert.equal(scoreActivity({ duplicateTicketAttempts: 1 }).score,60);
  assert.equal(scoreActivity({ duplicateTicketAttempts: 5 }).score,80);
});
test('combined score is capped at 100 and raw contribution sum remains explainable', () => {
  const result=scoreActivity({ bookingsLast10Minutes: 100, invalidScansLast10Minutes: 100, paymentFailuresLast30Minutes: 100, bookingsLast24Hours: 100, cancellationsLast24Hours: 100, duplicateTicketAttempts: 100 });
  assert.equal(result.score,100); assert.equal(result.rawScore,215); assert.equal(result.contributions.reduce((sum,c)=>sum+c.points,0),215);
});
test('invalid counts and impossible cancellation cohorts fail explicitly', () => {
  for(const value of [-1,NaN,Infinity,0.5,'9']) assert.throws(()=>scoreActivity({ bookingsLast10Minutes:value }));
  assert.throws(()=>scoreActivity({ bookingsLast24Hours:2,cancellationsLast24Hours:3 }));
});
test('small cancellation samples cannot trigger the cancellation rule or factor', () => {
  const result=scoreActivity({ bookingsLast24Hours:9,cancellationsLast24Hours:9 });
  assert.equal(result.score,0); assert.equal(result.contributions.find(c=>c.factor==='cancellationRate').points,0); assert.deepEqual(fraudRules(result.metrics),[]);
});
test('deterministic rules fire exactly at their configured thresholds', () => {
  for(const [factor,before,after,type] of [['bookingsLast10Minutes',8,9,'EXCESSIVE_BOOKING_ATTEMPTS'],['invalidScansLast10Minutes',4,5,'REPEATED_INVALID_SCANS'],['paymentFailuresLast30Minutes',2,3,'REPEATED_PAYMENT_FAILURES']]) {
    assert.ok(!fraudRules(scoreActivity({[factor]:before}).metrics).some(r=>r.type===type));
    assert.ok(fraudRules(scoreActivity({[factor]:after}).metrics).some(r=>r.type===type));
  }
  assert.ok(!fraudRules(scoreActivity({bookingsLast24Hours:10,cancellationsLast24Hours:5}).metrics).some(r=>r.type==='HIGH_CANCELLATION_RATE'));
  assert.ok(fraudRules(scoreActivity({bookingsLast24Hours:10,cancellationsLast24Hours:6}).metrics).some(r=>r.type==='HIGH_CANCELLATION_RATE'));
});
test('duplicate rule is tied to the current rejected scan and always HIGH', () => {
  const metrics=scoreActivity({duplicateTicketAttempts:8}).metrics;
  assert.ok(!fraudRules(metrics).some(r=>r.type==='DUPLICATE_TICKET_USE'));
  const rule=fraudRules(metrics,{duplicateEvent:true}).find(r=>r.type==='DUPLICATE_TICKET_USE');
  assert.equal(rule.score,60); assert.equal(severityForScore(rule.score),'HIGH');
});
test('model is deterministic, does not mutate inputs and uses non-accusatory explanations', () => {
  const input=Object.freeze({ invalidScansLast10Minutes:5 });
  const a=scoreActivity(input), b=scoreActivity(input); assert.deepEqual(a,b);
  assert.equal(a.score,35); assert.match(a.explanation,/requires review/);
  for(const r of fraudRules(a.metrics)) assert.ok(!/fraudster|guilty|criminal/i.test(r.explanation));
});
test('more booking attempts cannot reduce the score and zero denominators remain finite', () => {
  let last=0;
  for(let n=0;n<40;n++) { const s=scoreActivity({bookingsLast10Minutes:n});assert.ok(s.score>=last);last=s.score;assert.equal(s.metrics.cancellationRate,0); }
});
