import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeasurementEligibility } from '../frontend/src/services/measurement-policy.ts';

test('only a mounted permitted screen releases its exact current route', () => {
  const policy = createMeasurementEligibility();
  assert.equal(policy.canTrack('/tutor/pets/private-id', 'application'), false);
  const release = policy.mount('/tutor/pets/private-id', 'application');
  assert.equal(policy.canTrack('/tutor/pets/private-id', 'application'), true);
  assert.equal(policy.canTrack('/tutor/pets/another-id', 'application'), false);
  assert.equal(policy.canTrack('/tutor/pets/private-id', 'public'), false);
  release();
  assert.equal(policy.canTrack('/tutor/pets/private-id', 'application'), false);
});

test('sensitive public routes and unknown paths stay excluded even if mounted', () => {
  const policy = createMeasurementEligibility();
  for (const path of ['/tag/private-id', '/pet-tag/private-id', '/f/private-id', '/redefinir-senha', '/onboarding/tutor', '/unknown']) {
    policy.mount(path, 'public');
    assert.equal(policy.canTrack(path, 'public'), false, path);
  }
  policy.mount('/blog/public-article', 'public');
  assert.equal(policy.canTrack('/blog/public-article', 'public'), false);
  const release = policy.mount('/blog/public-article', 'public', true);
  assert.equal(policy.canTrack('/blog/public-article', 'public'), true);
  release();
  assert.equal(policy.canTrack('/blog/public-article', 'public'), false);
});

test('static public pages also require their mounted screen; independent leases survive stale cleanup', () => {
  const policy = createMeasurementEligibility();
  assert.equal(policy.canTrack('/', 'public'), false);
  const first = policy.mount('/', 'public');
  const second = policy.mount('/', 'public');
  first();
  assert.equal(policy.canTrack('/', 'public'), true);
  second();
  assert.equal(policy.canTrack('/', 'public'), false);
});
