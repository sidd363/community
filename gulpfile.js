'use strict';

const gulp = require('gulp')
  , mocha = require('gulp-mocha')
  , istanbul = require('gulp-istanbul')
  , exit = require('gulp-exit')
  , gulpSequence = require('gulp-sequence');
gulp.task('pre-test', () => {
  return gulp.src(['./common/*/*.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire());
});
gulp.task('test', ()=> {
  return gulp.src(['./test/**/*.js'])
    .pipe(mocha({ui: 'bdd', reporter: 'spec', timeout: 30000}))
    .pipe(istanbul.writeReports())
    .pipe(exit());
});
gulp.task('notification', ()=> {
  return gulp.src(['./test/notification.js'])
    .pipe(mocha({ui: 'bdd', reporter: 'spec', timeout: 30000}))
    .pipe(istanbul.writeReports())
    .pipe(exit());
});
gulp.task('coverage', gulpSequence('pre-test', 'test'));
gulp.task('default', ['coverage']);
