'use strict';

const STATUS = Object.freeze({
  DRAFT:    'DRAFT',
  PENDING:  'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
});

// In-place edits allowed only for these statuses
const EDITABLE_IN_PLACE = new Set([STATUS.DRAFT, STATUS.REJECTED]);

// These statuses block ALL edits
const LOCKED = new Set([STATUS.PENDING, STATUS.ARCHIVED]);

// Valid forward transitions (enforced in the service layer)
const TRANSITIONS = Object.freeze({
  [STATUS.DRAFT]:    [STATUS.PENDING],
  [STATUS.PENDING]:  [STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.APPROVED]: [STATUS.ARCHIVED],
  [STATUS.REJECTED]: [STATUS.PENDING],
  [STATUS.ARCHIVED]: [],
});

module.exports = { STATUS, EDITABLE_IN_PLACE, LOCKED, TRANSITIONS };
