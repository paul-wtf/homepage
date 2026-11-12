import type { ImageMetadata } from 'astro';
import bmwImg   from '../assets/bmw.jpg';
import paxImg   from '../assets/pax.png';
import eddyImg  from '../assets/eddy.jpg';
import lilyImg  from '../assets/lily.jpg';
import luckyImg from '../assets/lucky.jpg';
import jessyImg from '../assets/jessy.jpg';

export const bmwImage: ImageMetadata = bmwImg;
export const paxImage: ImageMetadata = paxImg;

export const catImages: Record<string, ImageMetadata> = {
  Eddy: eddyImg,
  Lily: lilyImg,
  Lucky: luckyImg,
  Jessy: jessyImg
};
