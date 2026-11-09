import { imageSlot } from './imageSlot.js';

export const loadLunchCurrent = imageSlot({
  ids: {
    current: 'lunch-current',
    image: 'lunch-current-image',
    pdfLink: 'lunch-current-pdf',
    label: 'lunch-current-label',
    removeBtn: 'lunch-remove-btn',
    editBtn: 'lunch-edit-label-btn',
    labelForm: 'lunch-label-form',
    editInput: 'lunch-label-input',
    labelError: 'lunch-label-error',
    labelSave: 'lunch-label-save',
    labelCancel: 'lunch-label-cancel',
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