module.exports = {
  packagerConfig: {
    asar: true,
    name: 'BookMDWorkbench',
    icon: './assets/icon',
    // Remove code signing for local testing; add for production
    // osxSign: {
    //   identity: 'Developer ID Application: Your Name',
    // },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        background: './assets/dmg-background.png',
        format: 'UDZO',
        icon: './assets/icon.icns',
        iconSize: 100,
        window: {
          width: 540,
          height: 380,
        },
        contents: [
          {
            x: 130,
            y: 170,
            type: 'file',
            path: '/Applications/BookMDWorkbench.app',
          },
          {
            x: 410,
            y: 170,
            type: 'link',
            path: '/Applications',
          },
        ],
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
};
