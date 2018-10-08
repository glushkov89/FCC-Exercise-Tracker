const express = require("express");
const app = express();
const bodyParser = require("body-parser");
var shortid = require("shortid");
const cors = require("cors");
const mongoose = require("mongoose");

const dateRegEx = /^[0-9]{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])/;
const minRegEx = /^[0-9]*$/g;
const htmlTagRegEx=/<[^>]+>/g;
const alpnumRegEx=/^[a-z0-9]+$/i;
//.replace(htmlTagRegEx, '');

const maxDate = new Date(8640000000000000);
const minDate = new Date(-8640000000000000);

mongoose.connect(
	process.env.MONGOLAB_URI || "mongodb://localhost/exercise-track"
);

/**************************Mongoose*********************************/

var Schema = mongoose.Schema;
var exerciseSchema = new Schema({
	description: { type: String, trim: true, required: true },
	duration: { type: Number, required: true },
	date: { type: Date, default: Date.now }
});
exerciseSchema.virtual("rdblDate").get(function() {
	return this.date.toUTCString().slice(0, 16);
});
var userSchema = new Schema({
	_id: {
		type: String,
		default: shortid.generate
	},
	username: { type: String, trim: true, required: true },
	log: {
		type: [exerciseSchema],
		default: []
	}
});
var User = mongoose.model("User", userSchema);

/********************************************************************/

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views/index.html");
});

/**************************My routes*********************************/

app.post("/api/exercise/new-user", function(req, res, next) {
	let username = req.body.username;
  if(username&&username.match(alpnumRegEx)){
	User.findOne({ username }, function(err, user) {
		if (!user) {
			User.create({ username })
				.then((result) =>
					res.json({ username: result.username, _id: result._id })
				)
				.catch((e) => next(new Error(e)));
		} else {
			return next(new Error(`User with username "${username}" already exists.`));
		}
	});
  }else return next(new Error('Username invalid'));
});

app.get("/api/exercise/users", function(req, res, next) {
	User.find({})
		.select("username _id")
		.then((users) => {
			res.json(users);
		})
		.catch((e) => next(new Error(e)));
});

app.post("/api/exercise/add", function(req, res, next) {
	let { userId, description, duration, date } = req.body;
	userId = userId.trim();
	date = date.trim();
  
  if (description.match(htmlTagRegEx)) return next(new Error("HTML tags in description are not allowed."));
	if (!(duration && userId && description))
		return next(
			new Error(
				`Required:${userId ? " " : " userId"}${
					description ? " " : " description"
				}${duration ? " " : " duration"}`
			)
		);
	if (!duration.match(minRegEx))
	return next(
			new Error(
				`'duration' must be a whole positive number'`
			)
		);
	if (!(date.match(dateRegEx) || !date)) return next(new Error("Check date format."));

	date = date ? new Date(date) : new Date();
	let exercise = { description, duration, date };

	User.findByIdAndUpdate(userId, { $push: { log: exercise } }, function(
		err,
		user
	) {
		if (err) return next(new Error(err));
		if (!user) return next(new Error(`Could not find user with ID.`));
		else {
			res.json({
				_id: user._id,
				username: user.username,
				description,
				duration: parseInt(duration),
				date: date.toUTCString().slice(0, 16)
			});
		}
	});
});

app.get("/api/exercise/log", function(req, res, next) {
	let { userId, from, to, limit } = req.query;
	userId = userId.trim();
	from = from.trim();
	to = to.trim();
	limit = limit.trim();

	if (!userId) next(new Error(`'userId' is required.`));
	if (!(from === "" || from.match(dateRegEx)))
		next(new Error("Check 'from' date format."));
	if (!(to === "" || to.match(dateRegEx)))
		next(new Error("Check 'to' date format."));
	if (!(limit === "" || limit.match(minRegEx)))
		next(
			new Error(`'limit' must be a whole positive number.'`)
		);

	from = from ? new Date(from) : minDate;
	to = to ? new Date(to) : maxDate;
	limit = parseInt(limit);

	User.findById(userId)
		.select("_id username log")
		.then((user) => {
			if (!user) next(new Error(`Could not find user with ID: '${userId}'`));
    console.log(user);
			let { _id, username, log } = user;
			if (!log.length) res.json({ _id, username, count: 0, log });
			limit = (log.length >= limit) ? limit : log.length;
			let myLog = log.reduce((acc, exer) => {
				if (limit > 0 && exer.date <= to && exer.date >= from) {
          let {description,duration,date}=exer;
					limit--;
          acc.push({description,duration,date:exer.rdblDate});
					return acc;
				} else return acc;
			}, []);
			res.json({ _id, username, count: myLog.length, log:myLog });
		})
		.catch((e) => next(new Error(e)));
});

/********************************************************************/

// Not found middleware
app.use((req, res, next) => {
	return next({ status: 404, message: "not found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
	let errCode, errMessage;

	if (err.errors) {
		// mongoose validation error
		errCode = 400; // bad request
		const keys = Object.keys(err.errors);
		// report the first validation error
		errMessage = err.errors[keys[0]].message;
	} else {
		// generic or custom error
		errCode = err.status || 500;
		errMessage = err.message || "Internal Server Error";
	}
	res
		.status(errCode)
		.type("txt")
		.send(errMessage);
});

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is listening on port " + listener.address().port);
});
