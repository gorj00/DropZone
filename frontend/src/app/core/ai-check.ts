import { Metric } from './api/models';

export const AI_VERIFIED = 'AI verified';
export const PHOTO_PROOF = 'Photo proof';

function labels(...list: string[]): ReadonlySet<string> {
  return new Set(list.map(l => l.trim().toLowerCase()));
}

const MEAL = labels('Food', 'Dish', 'Cuisine', 'Meal', 'Vegetable', 'Fruit', 'Salad', 'Recipe', 'Breakfast', 'Lunch',
  'Dinner', 'Produce', 'Baked goods', 'Meat', 'Fast food', 'Ingredient', 'Staple food', 'Snack', 'Seafood', 'Sandwich', 'Soup',
  'Pasta', 'Rice', 'Egg', 'Bread', 'Cheese', 'Dessert', 'Bento', 'Pizza', 'Sushi', 'Noodle', 'Poultry', 'Fish', 'Steak', 'Leaf vegetable',
  'Superfood', 'Brunch', 'Cooking', 'Comfort food');
const GYM = labels('Gym', 'Exercise', 'Muscle', 'Physical fitness', 'Weight training', 'Sports equipment',
  'Exercise equipment', 'Exercise machine', 'Strength training', 'Bodybuilding', 'Barbell', 'Dumbbell', 'Kettlebell', 'Weights',
  'Fitness', 'Treadmill', 'Powerlifting', 'Weightlifting');
const BIKE = labels('Bicycle', 'Cycling', 'Bicycle wheel', 'Bicycle helmet', 'Mountain bike', 'Road bicycle', 'Bicycle frame', 'Cyclist');
const HIKE = labels('Hiking', 'Mountain', 'Trail', 'Forest', 'Hill', 'Wilderness', 'Outdoor recreation', 'Walking',
  'Nature', 'Mountainous landforms', 'Backpacking', 'Trekking', 'Path', 'Park');
const SWIM = labels('Swimming', 'Swimming pool', 'Swimwear', 'Water sport', 'Swimmer', 'Pool', 'Lake', 'Beach', 'Sea', 'Leisure centre');
const SPORTS = labels('Sports', 'Ball', 'Team sport', 'Football', 'Soccer', 'Basketball', 'Tennis', 'Volleyball',
  'Player', 'Sports equipment', 'Stadium', 'Athlete', 'Running', 'Ball game', 'Racket', 'Field');
const MOBILITY = labels('Yoga', 'Stretching', 'Pilates', 'Yoga mat', 'Exercise', 'Physical fitness', 'Mat', 'Flexibility');
const MOVIE = labels('Television', 'Screen', 'Movie', 'Display device', 'Cinema', 'Popcorn', 'Entertainment',
  'Television set', 'Projector', 'Film');
const HANGOUT = labels('Friendship', 'Fun', 'Smile', 'Party', 'Event', 'Team', 'Crowd', 'Selfie', 'People',
  'Social group', 'Gathering', 'Leisure');
const SCALE = labels('Weighing scale', 'Scale', 'Bathroom scale', 'Measuring scales', 'Measuring instrument', 'Gauge');
const TAPE = labels('Tape measure', 'Measuring tape', 'Measuring instrument', 'Ruler', 'Tape', 'Abdomen', 'Waist',
  'Thigh', 'Arm', 'Chest', 'Muscle', 'Belly');

interface Subject {
  labels: ReadonlySet<string>;
  noun: string;
  reading: boolean;
}

const QUESTS: Record<string, Subject> = {
  HEALTHY_MEAL: { labels: MEAL, noun: 'a meal', reading: false },
  PROTEIN_MEAL: { labels: MEAL, noun: 'a meal', reading: false },
  EXTRA_MEAL: { labels: MEAL, noun: 'a meal', reading: false },
  GYM: { labels: GYM, noun: 'a workout', reading: false },
  BIKE: { labels: BIKE, noun: 'a bike ride', reading: false },
  HIKE: { labels: HIKE, noun: 'a hike', reading: false },
  SWIM: { labels: SWIM, noun: 'a swim', reading: false },
  SPORTS: { labels: SPORTS, noun: 'sports', reading: false },
  MOBILITY: { labels: MOBILITY, noun: 'stretching', reading: false },
  MOVIE_NIGHT: { labels: MOVIE, noun: 'a movie night', reading: false },
  HANGOUT: { labels: HANGOUT, noun: 'a hangout', reading: false },
  WEIGH_IN: { labels: SCALE, noun: 'a scale', reading: true }
};

const MILESTONES: Record<Metric, Subject> = {
  WEIGHT: { labels: SCALE, noun: 'a scale', reading: true },
  STRENGTH: { labels: GYM, noun: 'a workout', reading: false },
  SIZE: { labels: TAPE, noun: 'a tape measure', reading: false }
};

export interface AiCheckTarget {
  quest?: string | null;
  metric?: Metric;
  textOnly?: boolean;
  friends?: boolean;
}

export interface CameraVerdict {
  ok: boolean;
  title: string;
  note: string;
}

const NUMBER = /(?<![\d.,])(\d{2,3}(?:[.,]\d{1,2})?)(?![\d.,]*\d)/g;

export function readsAWeight(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  for (const m of text.matchAll(NUMBER)) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (v >= 20 && v <= 800) return true;
  }
  return false;
}

function subjectOf(target: AiCheckTarget): Subject | null {
  if (target.metric) return MILESTONES[target.metric];
  return target.quest ? QUESTS[target.quest] ?? null : null;
}

export function photoMatches(target: AiCheckTarget, found: string[], text: string | null): boolean {
  const s = subjectOf(target);
  if (!s) return false;
  if (s.reading && readsAWeight(text)) return true;
  if (target.textOnly) return false;
  return found.some(l => s.labels.has(l.trim().toLowerCase()));
}

export function cameraVerdict(target: AiCheckTarget | null | undefined, found: string[], text: string | null): CameraVerdict | null {
  if (!target) return null;
  const s = subjectOf(target);
  const friends = target.friends ? '3 people verify it next.' : null;
  if (!s) return { ok: true, title: PHOTO_PROOF, note: friends ?? 'Looks good? Use it as proof.' };
  if (photoMatches(target, found, text)) return { ok: true, title: `Looks like ${s.noun}`, note: friends ?? 'Use it as proof.' };
  return { ok: false, title: `Didn't recognise ${s.noun}`, note: friends ?? "It'll be saved as a photo proof." };
}

export function proofBadge(aiChecked: boolean | null | undefined): string {
  return aiChecked ? AI_VERIFIED : PHOTO_PROOF;
}
