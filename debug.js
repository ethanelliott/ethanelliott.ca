var express = require('express');
var app = express();
var http = require('http').Server(app);

var userList = [];
var typingUsers = {};

/** Static Files */
app.use('/', express.static(__dirname + '/'));

app.get('/*', function (req, res) {
  res.sendFile(__dirname + '/index.html');
	console.log("WHAT");
});

var port = process.env.PORT || 2056;
var server = app.listen(port, function () {
  console.log('listening on port: %s', port);
});

module.exports = app;
