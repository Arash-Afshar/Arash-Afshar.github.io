---
layout: single
classes: wide
author_profile: true
comments: false
share: true
title:  "Source code to pdf"
date:   2020-12-18 22:00:00 -0700
tags: [cli]
---

TL;DR concatenate all the files into one gigantic file, apply syntax
highlighting and convert to html using `pygmentize`. Convert the html
file to pdf using `wkhtmltopdf`.


It does not happen very often, but once in a while some of my clients
want their code in pdf format and every time I search the web and piece
together a bunch of bash commands and then completely forget it the next
time I need it. So, this time I decided to document it here, mostly for
myself, but hopefully it will useful for others as well. So here it
goes!



The idea is to use [pygments][pygments] to do the syntax highlighting
and create an html file and then create a pdf file from the result.


```bash
# I used it for Go files, but pygments supports a large number of programming languages.
find project_dir -type f -name "*.go"  -exec echo {} >> file_list \;
# Now that we have the list of files, need to add separators and concatenate them all
cat file_list | sed 's/\(.*\)/echo "#-----------------------NEW FILE--------------------------- \1" >> single_file.go \&\& cat \1 >> single_file.go \&\& echo "" >> single_file.go/g' > run.sh
bash run.sh
# Convert to html and then to pdf
pygmentize -l go -f html -O full,style=emacs single_file.go > single_file.html && wkhtmltopdf single_file.html single_file.pdf
ls single_file.pdf
```

[pygments][https://pygments.org]

