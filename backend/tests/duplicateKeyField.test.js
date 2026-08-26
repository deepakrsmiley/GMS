const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { duplicateKeyField } = require('../utils/duplicateKeyField');

describe('duplicateKeyField', () => {
  it('uses email when that is the only key', () => {
    assert.equal(duplicateKeyField({ keyValue: { email: 'a@b.com' } }), 'email');
  });

  it('skips organizationId so compound unique errors name the real field', () => {
    assert.equal(
      duplicateKeyField({
        keyValue: { organizationId: 'org1', email: 'a@b.com' },
        keyPattern: { organizationId: 1, email: 1 },
      }),
      'email',
    );
  });

  it('reads the field from the Mongo error message when keyValue is missing', () => {
    assert.equal(
      duplicateKeyField({
        message: 'E11000 duplicate key error collection: hms.users index: email_1 dup key: { email: "a@b.com" }',
      }),
      'email',
    );
  });
});
