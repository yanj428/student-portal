import { imageSlot } from './imageSlot.js';

export const loadLunchCurrent = imageSlot({
  ids: {
    current: 'lunch-current',
    image: 'lunch-current-image',
    pdfLink: 'lunch-current-pdf',
    label: 'lunch-current-label',
    removeBtn: 'lunch-remove-btn',
    form: 'lunch-upload-form',
    labelInput: 'lunch-week-label',
    fileInput: 'lunch-image-input',
    error: 'lunch-upload-error',
    submit: 'lunch-upload-submit',
  },
  endpoint: '/api/admin/lunch-image',
  contentKey: 'lunchSchedule',
  labelField: 'weekLabel',
  emptyLabel: 'No week label set',
  noun: 'lunch menu',
});