// RequestAnimFrame: a browser API for getting smooth animations
window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame       ||
		  window.webkitRequestAnimationFrame ||
		  window.mozRequestAnimationFrame    ||
		  window.oRequestAnimationFrame      ||
		  window.msRequestAnimationFrame     ||
		  function( callback ){
			window.setTimeout(callback, 1000 / 60);
		  };
})();

var canvas = document.getElementById("canvas");
var ctx = canvas.getContext("2d");
var W = window.innerWidth;
var H = window.innerHeight;
canvas.width = W;
canvas.height = H;

function canvasResize()
{
  console.log("Resizing!");
  var W = window.innerWidth;
  var H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
  paintCanvas();
}
canvasResize();
window.addEventListener('resize', canvasResize());

var particleCount = 100;
var	particles = [];
var	minDist = 80;
var	dist;

function paintCanvas() {
	ctx.fillStyle = "rgba(0,0,0,1)";
	ctx.fillRect(0,0,W,H);
}

function Particle() {
	this.x = Math.random() * W;
	this.y = Math.random() * H;
  var dirX = 0;
  var dirY = 0;
  if (Math.random() > 0.5){dirX = -1;} else {dirX = 1;}
  if (Math.random() > 0.5){dirY = 1;} else {dirY = -1;}
	this.vx = dirX + Math.random();
	this.vy = dirY + Math.random();
	this.radius = 1;

	this.draw = function() {
		ctx.fillStyle = "#FFFFFF";
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
		ctx.fill();
	};
}

for(var i = 0; i < particleCount; i++) {
	particles.push(new Particle());
}

function draw() {
	paintCanvas();
	for (var i = 0; i < particles.length; i++) {
		p = particles[i];
		p.draw();
	}
	update();
}

function update() {
	for (var i = 0; i < particles.length; i++) {
		p = particles[i];

		p.x += p.vx;
		p.y += p.vy;

		if(p.x + p.radius > W){
      p.x = p.radius;
    } else if(p.x - p.radius < 0) {
			p.x = W - p.radius;
		}
		if(p.y + p.radius > H) {
			p.y = p.radius;
    } else if(p.y - p.radius < 0) {
			p.y = H - p.radius;
		}

		for(var j = i + 1; j < particles.length; j++) {
			p2 = particles[j];
			distance(p, p2);
		}
	}
}

function distance(p1, p2) {
	var dist;
	var	dx = p1.x - p2.x;
	var	dy = p1.y - p2.y;

	dist = Math.sqrt(dx*dx + dy*dy);

	if(dist <= minDist) {
		var ax = dx/10000;
    var ay = dy/10000;
		p1.vx -= ax;
		p1.vy -= ay;

		p2.vx += ax;
		p2.vy += ay;
	}
}

function animloop() {
	draw();
	requestAnimFrame(animloop);
}
animloop();




$(document).ready(function(){
  $("#content > *").css({"display":"none"});
    $("#navAbout").click(function(){
      displayContent(1);
    });
    $("#navLanguages").click(function(){
      displayContent(2);
    });
    $("#navExperience").click(function(){
      displayContent(3);
    });
});
var contentDisplay = false;
var lastOpened = 0;
function displayContent(openIndex)
{
  //console.log("display: " + contentDisplay + ", lastOpened: " + lastOpened + ", opening: " + openIndex);
  if (openIndex != lastOpened && !contentDisplay){
    contentDisplay = !contentDisplay;
  }
  else if (openIndex === lastOpened && !contentDisplay) {
    contentDisplay = !contentDisplay;
  }
  else if (openIndex === lastOpened && contentDisplay) {
    contentDisplay = !contentDisplay;
  }
  lastOpened = openIndex;

  switch (openIndex)
  {
    case 1:
      {
        if (contentDisplay){
          $("#navAbout").css({"border-bottom":"2px solid #0037d4"});
          $("#navLanguages").css({"border-bottom":"2px solid #FFFFFF"});
          $("#navExperience").css({"border-bottom":"2px solid #FFFFFF"});
          $("title").html("Ethan Elliott | About");
          $.get('about.txt', function(data) {
             $("#contentContent").html(data.replace('\n',''));
          }, 'html');
        } else {
          $("#navAbout").css({"border-bottom":"2px solid #FFFFFF"});
          $("title").html("Ethan Elliott");
        }
        $("#contentHeader").html("About");
      }
      break;
    case 2:
      {
        if (contentDisplay){
          $("#navAbout").css({"border-bottom":"2px solid #FFFFFF"});
          $("#navLanguages").css({"border-bottom":"2px solid #0037d4"});
          $("#navExperience").css({"border-bottom":"2px solid #FFFFFF"});
          $("title").html("Ethan Elliott | Languages");
          $.get('languages.txt', function(data) {
             $("#contentContent").html(data.replace('\n',''));
          }, 'html');
        } else {
          $("#navLanguages").css({"border-bottom":"2px solid #FFFFFF"});
          $("title").html("Ethan Elliott");
        }
        $("#contentHeader").html("Languages");
      }
      break;
    case 3:
      {
        if (contentDisplay){
          $("#navAbout").css({"border-bottom":"2px solid #FFFFFF"});
          $("#navLanguages").css({"border-bottom":"2px solid #FFFFFF"});
          $("#navExperience").css({"border-bottom":"2px solid #0037d4"});
          $("title").html("Ethan Elliott | Experience");
          $.get('experience.txt', function(data) {
             $("#contentContent").html(data.replace('\n',''));
          }, 'html');
        } else {
          $("#navExperience").css({"border-bottom":"2px solid #FFFFFF"});
          $("title").html("Ethan Elliott");
        }
        $("#contentHeader").html("Experience");
      }
      break;
  }

  if (contentDisplay)
  {
    $("#content").css({"height":"44vh", "width":"80vw", "padding":"2vh 2vw", "border":"1px solid black"});
    $("#content > *").css({"display":"block"});
    $("#title").css({"margin-top":"5vh"});
  }
  else {
    $("#content").css({"height":"0vh", "width":"0vw", "padding":"0vh 0vw", "border":"0px solid black"});
    $("#content > *").css({"display":"none"});
    $("#title").css({"margin-top":"35vh"});
    $("#contentContent").html("");
  }
}
