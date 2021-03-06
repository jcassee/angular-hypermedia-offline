module.exports = function (config) {
  config.set({

    files: [
      'bower_components/angular/angular.js',
      'bower_components/angular-hypermedia/dist/hypermedia.js',
      'bower_components/angular-mocks/angular-mocks.js',
      'bower_components/angular-netstatus/src/netstatus.js',
      'bower_components/dexie/dist/latest/Dexie.js',
      'bower_components/linkheader-parser/dist/linkheader-parser-browser.js',
      'bower_components/mediatype-parser/dist/mediatype-parser-browser.js',
      'bower_components/uri-templates/uri-templates.js',
      'src/**/*.js'
    ],

    autoWatch: true,

    frameworks: ['jasmine'],

    browsers: ['PhantomJS'],

    preprocessors: {
      'src/**/!(*.spec)+(.js)': ['coverage']
    },

    reporters: ['progress', 'coverage'],

    coverageReporter: {
      dir: 'build/coverage',
      reporters: [
        {type: 'text-summary'},
        {type: 'html', subdir: '.'},
        {type: 'lcovonly', subdir: '.'}
      ]
    }
  });
};
