import { buildSystem, SOLAR_SYSTEM } from '../systems/SystemDescriptor';
import type { MapObject } from '../../catalog/StarMapData';
import anchors from './ReviewAnchors.json' with {type:'json'};
/** Six real AT-HYG anchors copied from the local catalogue. Their generated worlds are explicitly fictional. */
export const REVIEW_SYSTEMS=[SOLAR_SYSTEM,...anchors.map(anchor=>buildSystem(anchor as unknown as MapObject))];
export const REVIEW_WORLDS=REVIEW_SYSTEMS.flatMap(system=>system.bodies.map(body=>({system,body})));
