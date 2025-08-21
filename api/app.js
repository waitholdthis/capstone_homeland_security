const express = require('express');
const cookieParser = require('cookie-parser');
// const { parse } = require('csv-parse/sync');
// const { stringify } = require('csv-stringify/sync');
// const bodyParser = require('body-parser');
// const fs = require('fs');

const app = express();
const port = 8000;

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => res.send('Hello World'));

app.listen(port, () => {
	console.log(`Example app listening at http://localhost:${port}`)
})