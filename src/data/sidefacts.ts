import type { Localized } from './i18n';

export interface Cat {
  name: string;
  personality: Localized<string>;
}

export const bmw: { model: string; text: Localized<string> } = {
  model: 'BMW i4 eDrive35',
  text: {
    de: 'Mein erstes E-Auto. Ich war skeptisch, aber das Fahrgefühl hat mich überzeugt — und Laden, Reichweite und Routenplanung sind für mich überraschend unkompliziert.',
    en: 'My first electric car. I was skeptical, but the way it drives won me over, and charging, range and route planning have turned out to be surprisingly easy for me.'
  }
};

export interface Pax {
  species: string;
  pronouns: string;
  description: string;
  likes: string[];
  dislikes: string[];
}

export const paxAge = 22;

export const pax: Localized<Pax> = {
  de: {
    species: 'Polarfuchs',
    pronouns: 'er/ihn',
    description:
      'Verspielt, neugierig, ein kleiner Gremlin. Chaotische Energie mit einer technikaffinen, cleveren Seite darunter.',
    likes: [
      'An Technik herumbasteln',
      'kaltes Wetter',
      'Snacks',
      'an Dingen herumstochern, auf denen „nicht berühren“ steht'
    ],
    dislikes: [
      'Proprietäre Software',
      'langsames WLAN'
    ]
  },
  en: {
    species: 'Arctic fox',
    pronouns: 'he/him',
    description:
      'Playful, curious, a little gremlin. Chaotic energy with a clever, tech-minded side underneath.',
    likes: [
      'tinkering with tech',
      'cold weather',
      'snacks',
      'poking at things labeled "do not touch"'
    ],
    dislikes: [
      'proprietary software',
      'slow Wi-Fi'
    ]
  }
};

export const cats: Cat[] = [
  {
    name: 'Eddy',
    personality: {
      de: 'Liebenswert, aber stur. Bekommt immer was er will.',
      en: 'Lovable but stubborn. Always gets what he wants.'
    }
  },
  {
    name: 'Lily',
    personality: {
      de: 'Eine kleine Kuschelprinzessin.',
      en: 'A little cuddle princess.'
    }
  },
  {
    name: 'Lucky',
    personality: {
      de: 'Unruhestifter, zur richtigen Zeit aber auch kuschelig.',
      en: 'A troublemaker who can be cuddly when the moment is right.'
    }
  },
  {
    name: 'Jessy',
    personality: {
      de: 'Schläft mehr als sie wach ist.',
      en: 'Asleep more often than awake.'
    }
  }
];
