import {Control, control} from './Control.js';
import {Layers, layers} from './Control.Layers.js';
import {Zoom, zoom} from './Control.Zoom.js';
import {Scale, scale} from './Control.Scale.js';

Control.Layers = Layers;
Control.Zoom = Zoom;
Control.Scale = Scale;

control.layers = layers;
control.zoom = zoom;
control.scale = scale;

export {Control, control};
