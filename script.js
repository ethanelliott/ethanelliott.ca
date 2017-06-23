var c;

var PointInSpace = function() {
	this.x = random(0, width);
	this.y = random(0, height);
	this.vx = random(-1.5,1.5);
	this.vy = random(-1.5,1.5);
	this.ax = 0;
	this.ay = 0;
	this.update = function() {
		this.x += this.vx;
		this.y += this.vy;
		if (this.x < 0) {
			this.x = width;
		} else if (this.x > width) {
			this.x = 0;
		}
		if (this.y < 0) {
			this.y = height;
		} else if (this.y > height) {
			this.y = 0;
		}
	}
	this.show = function() {
		ellipse(this.x, this.y, 3, 3);
	}
};

function distance(p1, p2) {
	var	minDist = 80;
	var dist;
	var	dx = p1.x - p2.x;
	var	dy = p1.y - p2.y;

	dist = Math.sqrt(dx*dx + dy*dy);

	if(dist <= minDist) {
		var ax = dx/100000;
    	var ay = dy/100000;
		p1.vx -= ax;
		p1.vy -= ay;
		p2.vx += ax;
		p2.vy += ay;
	}
}

var points = [];
var numOfPoints = 200;

function setup() {
	c = createCanvas(windowWidth, windowHeight);
	c.parent('sketch-wrapper');
	for (var i = 0; i < numOfPoints; i++) {
		points[i] = new PointInSpace();
	}
}
function draw()
{
	frameRate(60);
	background(0,0,0);
	for (var i = 0; i < points.length; i++) {
		points[i].update();
		points[i].show();
		for (var j = i + 1; j < points.length; j++) {
			distance(points[i], points[j]);
		}
	}
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}


$(window).scroll(function() {
    if(($(this).scrollTop()) > $("#front-wrapper").height()/2) {
        $('.right-side-menu').fadeIn();
    } else {
        $('.right-side-menu').fadeOut();
    }

	var halfPageHeight = $("#front-wrapper").height() / 2;
	if($(this).scrollTop() > $("#resume").offset().top - halfPageHeight && $(this).scrollTop() < ($("#resume").offset().top + $(".resume").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,1)"});
	} else if($(this).scrollTop() > $("#projects").offset().top - halfPageHeight && $(this).scrollTop() < ($("#projects").offset().top + $(".projects").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,1)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	} else if($(this).scrollTop() > $("#skills").offset().top - halfPageHeight && $(this).scrollTop() < ($("#skills").offset().top + $(".skills").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,1)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	} else if($(this).scrollTop() > $("#about").offset().top - halfPageHeight && $(this).scrollTop() < ($("#about").offset().top + $(".about").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,1)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	} else if ($(this).scrollTop() > $("#front-wrapper").offset().top - halfPageHeight && $(this).scrollTop() < ($("#front-wrapper").offset().top + $("#front-wrapper").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,1)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	}
 });

 var projects = [
	 {
		 name: "Name of Project",
		 image: "this.jpg",
		 description:"Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		 url: "http://google.ca",
		 //codeUrl: "http://github.com/ethanelliott",
		 languages: ["Javascript", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 },
	 {
		 name: "Name of Project",
		 image: "this.jpg",
		 description:"Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		 url: "http://google.ca",
		 codeUrl: "http://github.com/ethanelliott",
		 languages: ["Javascript", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 },
	 {
		 name: "Name of Project",
		 image: "this.jpg",
		 description:"Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		 url: "http://google.ca",
		 codeUrl: "http://github.com/ethanelliott",
		 languages: ["Javascript", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 },
	 {
		 name: "Name of Project",
		 image: "this.jpg",
		 description:"Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		 url: "http://google.ca",
		 codeUrl: "http://github.com/ethanelliott",
		 languages: ["Javascript", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 }
 ];

 function loadProjects() {
	 var output = "";
	 for (var i = 0; i < projects.length; i++)
	 {
		 output += '<div id="project-card">';
		 output += '<div id="project-card-image"><img src="' + projects[i].image + '" /></div>';
		 output += '<div id="project-card-title">' + projects[i].name + '</div>';
		 output += '<div id="project-card-description">' + projects[i].description + '</div>';
		 output += '<div class="chip-container">'
		 for (var j = 0; j < projects[i].languages.length; j++)
		 {
			 output += '<div class="chip">' + projects[i].languages[j].toUpperCase() + '</div>';
		 }
		 output += '</div>';
		 output += '<div id="project-card-url-container">';
		 if (projects[i].codeUrl) {
			output += '<a href="' + projects[i].codeUrl + '"><div>View the code</div></a>';
		 }
		 if (projects[i].url) {
			output += '<a href="' + projects[i].url + '"><div>View the project</div></a>';
		 }
		 output += '</div>';
		 output += '</div>';
	 }
	 $("#project-card-wrapper").html(output);
 }

 $(window).load(function(){
	 loadProjects();
	 $('.right-side-menu').fadeOut(0);
 });
