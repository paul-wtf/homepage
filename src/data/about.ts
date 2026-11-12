import type { Localized } from './i18n';

export interface About {
  name: string;
  tagline: string;
  paragraphs: string[];
}

export const about: Localized<About> = {
  de: {
    name: 'Paul Reitmayer',
    tagline: 'Elektrotechniker am Erdgasspeicher Bierwang. Software-Engineering als Hobby.',
    paragraphs: [
      'Hauptberuflich Elektrotechniker am Erdgasspeicher von Uniper Energy Storage in Bierwang. Anlagensteuerung, MSR-Technik, Energieversorgung — Systeme, die zuverlässig laufen müssen, auch wenn niemand auf einen Knopf drückt.',
      'Nebenher Software-Engineering als Hobby — Backend, Infrastruktur, Self-Hosting. Mich reizt am meisten, wenn Technik aufhört, magisch zu sein: ein eigener Music-Link-Converter statt Odesli, ein eigener Mail-Server statt Gmail, eigener Kubernetes-Cluster statt Vendor-PaaS. Nicht aus Ideologie, sondern weil ich verstehen will, was ich täglich nutze, und weil ich keinen Bock habe, dass mein Alltag aus Black Boxes besteht, die jemand anderes hostet.'
    ]
  },
  en: {
    name: 'Paul Reitmayer',
    tagline: 'Electrical technician at the Bierwang gas storage facility. Software engineering as a hobby.',
    paragraphs: [
      'By day I am an electrical technician at the natural gas storage facility that Uniper Energy Storage runs in Bierwang. Plant control, instrumentation, power supply: systems that have to keep running even when nobody is pressing a button.',
      'On the side I do software engineering as a hobby: backend, infrastructure, self-hosting. I like it best when technology stops being magic. So there is my own music link converter where others use Odesli, my own mail server where others use Gmail, and my own Kubernetes cluster where a vendor PaaS would do. There is no ideology behind it. I want to understand what I use every day, and I have no patience for a daily life made of black boxes that somebody else hosts.'
    ]
  }
};
