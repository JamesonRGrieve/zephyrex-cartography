// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A light switch is a door wall, so players use it with Foundry's own door
 * control. This makes that control show a light instead of a door: lit while
 * the switch is on (its door open), unlit while it is off. It extends
 * whatever door control class is configured, so another module's own
 * override still applies to every other door. A switch's wall is marked by
 * the module's `lightSwitch` flag.
 */
import { MODULE_ID } from '../module-id';

/** Whether `flags` (a wall's) mark it as a light switch's. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a document's flags are arbitrary serialised JSON
function marksLightSwitch(flags: Readonly<Record<string, unknown>>): boolean {
    const own = flags[MODULE_ID];
    return typeof own === 'object' && own !== null && 'lightSwitch' in own && own.lightSwitch === true;
}

/** Install the light switch's door control over the configured one; call once, at setup, after other modules' init. */
export function registerSwitchDoorControl(): void {
    const Base = CONFIG.Canvas.doorControlClass;
    class SwitchDoorControl extends Base {
        protected override _getTexture(): ReturnType<typeof foundry.canvas.getTexture> {
            const wall = this.wall.document;
            if (!marksLightSwitch(wall.flags)) {
                return super._getTexture();
            }
            const icons = CONFIG.controlIcons;
            return foundry.canvas.getTexture(wall.ds === CONST.WALL_DOOR_STATES.OPEN ? icons.light : icons.lightOff) ?? super._getTexture();
        }
    }
    CONFIG.Canvas.doorControlClass = SwitchDoorControl;
}
