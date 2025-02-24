# PrimeNG 'p-menubar' Class Changes (v17-v19)

## Summary

The most important class name changes for the `p-menubar` component in the PrimeNG library from version 17 to 19 are:

1. Bidirectional changes between `p-menubar-item-content` and `p-menubar-item-label` classes.
2. Bidirectional changes between `p-menubar-mobile` and `p-menubar-mobile-active` classes.
3. Potential replacements for `p-menubar-separator` and `p-menubar-mobile` classes.
4. Addition of data-pc-section attributes for improved accessibility.

## High Confidence Replacements (67%+ similarity)

- `p-menubar-item-content` -> `p-menubar-item-label` (75% similarity)
- `p-menubar-item-label` -> `p-menubar-item-content` (75% similarity)
- `p-menubar-mobile` -> `p-menubar-mobile-active` (75% similarity)
- `p-menubar-mobile-active` -> `p-menubar-mobile` (75% similarity)
- `p-menubar-separator` -> `p-menubar-mobile` (67% similarity)
- `p-menubar-mobile` -> `p-menubar-separator` (67% similarity)

## Ambiguous Bidirectional Changes

The following class name changes have a 50% similarity, indicating potential ambiguity:

- `p-menubar-item-content` <-> `p-menubar-submenu-icon`
- `p-menubar-item-content` <-> `p-menubar-separator`
- `p-menubar-item-content` <-> `p-menubar-mobile`
- `p-menubar-item-content` <-> `p-menubar-mobile-active`
- `p-menubar-item-label` <-> `p-menubar-submenu-icon`
- `p-menubar-item-label` <-> `p-menubar-separator`
- `p-menubar-item-label` <-> `p-menubar-mobile`
- `p-menubar-item-label` <-> `p-menubar-mobile-active`
- `p-menubar-submenu-icon` <-> `p-menubar-item-content`
- `p-menubar-submenu-icon` <-> `p-menubar-item-label`
- `p-menubar-submenu-icon` <-> `p-menubar-separator`
- `p-menubar-submenu-icon` <-> `p-menubar-mobile`
- `p-menubar-submenu-icon` <-> `p-menubar-mobile-active`
- `p-menubar-separator` <-> `p-menubar-item-content`
- `p-menubar-separator` <-> `p-menubar-item-label`
- `p-menubar-separator` <-> `p-menubar-submenu-icon`
- `p-menubar-separator` <-> `p-menubar-mobile-active`
- `p-menubar-mobile` <-> `p-menubar-item-content`
- `p-menubar-mobile` <-> `p-menubar-item-label`
- `p-menubar-mobile` <-> `p-menubar-submenu-icon`
- `p-menubar-mobile-active` <-> `p-menubar-item-content`
- `p-menubar-mobile-active` <-> `p-menubar-item-label`
- `p-menubar-mobile-active` <-> `p-menubar-submenu-icon`
- `p-menubar-mobile-active` <-> `p-menubar-separator`

## Structural Changes

The main structural changes include:

1. Addition of `data-pc-section` and `data-pc-name` attributes to the root `<div>` element of the `p-menubar` component.
2. Modification of the `[ngClass]` binding to include the `'p-menubar p-component'`, `'p-menubar-mobile'`, and `'p-menubar-mobile-active'` classes.

## Implementation Recommendations

To update theme files for the `p-menubar` component, consider the following recommendations:

1. Review the bidirectional class name changes and update any references accordingly.
2. Ensure that the new `data-pc-section` and `data-pc-name` attributes are accounted for in the CSS selectors.
3. Update the CSS selectors to match the modified `[ngClass]` binding, including the additional `'p-menubar-mobile'` and `'p-menubar-mobile-active'` classes.
4. Review the potential replacements for `p-menubar-separator` and `p-menubar-mobile` classes and make appropriate updates.
5. Thoroughly test the `p-menubar` component in various scenarios, including mobile responsiveness, to ensure a smooth transition.