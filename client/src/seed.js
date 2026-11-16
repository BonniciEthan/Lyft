import { IS_LOCAL } from './edition.js';

export const SEED_STATE = {
  lastSynced: null,
  split: {
    Monday: 'Push',
    Tuesday: 'Pull',
    Wednesday: 'Legs',
    Thursday: 'Push',
    Friday: 'Pull',
    Saturday: 'Rest',
    Sunday: 'Rest',
  },
  workouts: {
    Push: [
      { id: 'push-1', name: 'Flat Barbell Bench', defaultSets: 3 },
      { id: 'push-2', name: 'Incline Dumbbell Bench', defaultSets: 3 },
      { id: 'push-3', name: 'High to Low Cable Extensions', defaultSets: 3 },
      { id: 'push-4', name: 'Side Cable Lateral Raises', defaultSets: 3 },
      { id: 'push-5', name: 'Tricep Rope Overhead Extension', defaultSets: 3 },
      { id: 'push-6', name: 'Tricep Bar Pushdown', defaultSets: 3 },
      { id: 'push-7', name: 'Uwu Curls', defaultSets: 3 },
      { id: 'push-8', name: 'Reverse Uwu Curls', defaultSets: 3 },
    ],
    Pull: [
      { id: 'pull-1', name: 'Wide Grip Lat Pulldown', defaultSets: 3 },
      { id: 'pull-2', name: 'Close Grip Lat Pulldown', defaultSets: 3 },
      { id: 'pull-3', name: 'Close Grip Cable Rows', defaultSets: 3 },
      { id: 'pull-4', name: 'Flat Grip Machine Row', defaultSets: 3 },
      { id: 'pull-5', name: 'Reverse Pec Dec', defaultSets: 3 },
      { id: 'pull-6', name: 'Face Pulls', defaultSets: 3 },
      { id: 'pull-7', name: 'Kelso Shrugs', defaultSets: 3 },
      { id: 'pull-8', name: 'Shrugs', defaultSets: 3 },
      { id: 'pull-9', name: 'Dumbbell Curls', defaultSets: 3 },
      { id: 'pull-10', name: 'Cable Hammer Curls', defaultSets: 3 },
    ],
    Legs: [
      { id: 'legs-1', name: 'Squats', defaultSets: 3 },
      { id: 'legs-2', name: 'SLDL', defaultSets: 3 },
      { id: 'legs-3', name: 'Leg Extensions', defaultSets: 3 },
      { id: 'legs-4', name: 'Hamstring Curls', defaultSets: 3 },
      { id: 'legs-5', name: 'Standing Calf Raises', defaultSets: 3 },
      { id: 'legs-6', name: 'Abductor Machine', defaultSets: 3 },
      { id: 'legs-7', name: 'Adductor Machine', defaultSets: 3 },
      { id: 'legs-8', name: 'Incline Dragon Flag', defaultSets: 3 },
    ],
  },
  logs: {},
  profile: { bodyweight: null, sex: 'male', unit: 'kg', bodyweightHistory: [], displayName: 'Lifter', avatarDataUrl: null },
  goals: [
    {
      id: 'goal-1',
      exercise: 'Flat Barbell Bench',
      startPR: 80,
      currentPR: 80,
      targetPR: 100,
      targetDate: '',
      notes: 'Clean pause reps',
      achieved: false,
    },
  ],
};

/** Empty starting point for the standalone (friends) edition. */
export const EMPTY_STATE = {
  lastSynced: null,
  split: {
    Monday: 'Rest',
    Tuesday: 'Rest',
    Wednesday: 'Rest',
    Thursday: 'Rest',
    Friday: 'Rest',
    Saturday: 'Rest',
    Sunday: 'Rest',
  },
  workouts: { Push: [], Pull: [], Legs: [] },
  logs: {},
  profile: { bodyweight: null, sex: 'male', unit: 'kg', bodyweightHistory: [], displayName: 'Lifter', avatarDataUrl: null },
  goals: [],
};

export function createSeedState() {
  return JSON.parse(JSON.stringify(IS_LOCAL ? EMPTY_STATE : SEED_STATE));
}
