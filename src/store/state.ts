import { Incident } from '../types/incident';

export const state = {
  incidents: [] as Incident[],
  simOffline: false,
  currentFilter: 'ALL'
};

export const USER = { lat: 0, lng: 0, accuracy: 0 };
