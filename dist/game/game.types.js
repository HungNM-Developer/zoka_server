"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomStatus = exports.COUNTER_CHAIN = exports.Element = void 0;
var Element;
(function (Element) {
    Element["FIRE"] = "Fire";
    Element["ICE"] = "Ice";
    Element["WIND"] = "Wind";
    Element["EARTH"] = "Earth";
    Element["ELECTRIC"] = "Electric";
    Element["WATER"] = "Water";
})(Element || (exports.Element = Element = {}));
exports.COUNTER_CHAIN = {
    [Element.FIRE]: Element.ICE,
    [Element.ICE]: Element.WIND,
    [Element.WIND]: Element.EARTH,
    [Element.EARTH]: Element.ELECTRIC,
    [Element.ELECTRIC]: Element.WATER,
    [Element.WATER]: Element.FIRE,
};
var RoomStatus;
(function (RoomStatus) {
    RoomStatus["WAITING"] = "WAITING";
    RoomStatus["PLAYING"] = "PLAYING";
    RoomStatus["FINISHED"] = "FINISHED";
})(RoomStatus || (exports.RoomStatus = RoomStatus = {}));
//# sourceMappingURL=game.types.js.map