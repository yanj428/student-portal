import { imageSlot } from './imageSlot.js';

export const loadCalendarImage = imageSlot({
  ids: {
    current: 'calendar-image-current',
    image: 'calendar-image-preview',
    label: 'calendar-image-current-label',
    removeBtn: 'calendar-image-remove-btn',
    form: 'calendar-image-form',
    labelInput: 'calendar-image-label-input',
    fileInput: 'calendar-image-input',
    error: 'calendar-image-error',
    submit: 'calendar-image-submit',
  },
  endpoint: '/api/admin/calendar-image',
  contentKey: 'calendarImage',
  labelField: 'label',
  emptyLabel: 'No label set',
  noun: 'school year calendar picture',
});