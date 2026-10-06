'use strict';

function outletAccessoryDisplayName(config, outletName) {
  const cleanOutletName = String(outletName || 'Outlet').trim();
  if (config?.exposeCycleSwitches !== false) {
    return `${config?.cyclePrefix || 'Power Cycle'} ${cleanOutletName}`.trim();
  }
  return cleanOutletName;
}

module.exports = {
  outletAccessoryDisplayName,
};
