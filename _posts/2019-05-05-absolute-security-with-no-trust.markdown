---
layout: single
classes: wide
author_profile: true
comments: true
share: true
title:  "Absolute Security with No Trust"
date:   2019-05-05 07:00:00 -0700
tags: [security, theory]
---

Designing and implementing secure software solutions usually involves a discussion about the level
of security and the effort and cost of achieving that level of security. The cost and effort are a
function of the upfront cost of development, time to market, and the cost of fixing the security
problem when they are exploited. Depending on the product, the company, and the severity of the
problem, the later cost could also involve regaining the trust of the customers (e.g., numerous
security breaches of [Facebook][facebook]) or losing a significant part of the business as in the
case of [VFEmail][vfemail]. Based on the risk tolerance and other factors, software products fall
somewhere in the following spectrum of security.

- No security! It is fast, easy, and cheap to develop but carries significant risk and will require
  a huge cost to make it secure later.
- Some levels of security have been considered and implemented and the rest is protected with NDAs
  or other non-technical means.
- Absolute security without trusting any third-party (more formally known as Information-theoretic
  security or Unconditional security).

In this post, I will talk about the last item and discuss how feasible or practical it is. I will
argue that although absolute security is not possible in practice, it is important that we put
effort in research in fields such as "Secure Multiparty Computation" to provide the tools necessary
for making a reasonable compromise with regard to security of the product and the amount of things
that we have to trust.

Let's start with a simple example to demonstrate if absolute security is achievable or not. In this
example, we have a `client` which wants to encrypt the a `secret file` and outsource it to a `cloud`
for storage such that the cloud can never find the content of the file.


Theory
------

You can achieve information-theoretic security by using a simple `XOR` function. Consider the case
where the content of the `secret file` is a binary string `101010`. Now assume the client has picked
a password which is also a binary string, say `100101`. The client XORs the file content with the
password (using the following function) and sends the result to the cloud. 

{% highlight python %}
def encrypt(content, password):
  m = int(content, 2)
  k = int(password, 2)
  c = m ^ k
  return "{0:b}".format(c).zfill(6)

encrypt("101010", "100101")
#=> prints '001111'
{% endhighlight %}

*Why is this way of encryption secure?* Assume you are the cloud and you have received `001111` from
the client. Also assume that you have unlimited CPU and memory and you decide to try all possible
passwords (i.e., perform a brute-force attack) to find the content of the secret file. You notice
that the message is 6 characters long and therefore you try all the passwords between `000000` to
`111111` using the following function.

{% highlight python %}
def brute_force(secret):
  c = int(secret, 2)
  possible_results = []
  for possible_password in xrange(int("111111", 2)+1):
    possibility = "{0:b}".format(possible_password ^ c)
    possible_results.append(possibility.zfill(6))
  return possible_results

brute_force("001111")
#=> Can you guess what it prints?
{% endhighlight %}

If you run this function, you will notice that it is printing all values between `000000` and
`111111`. In other words, it will print all the possible contents of the secret file! This means
that brute-forcing did not help at all and you (i.e., the cloud) still have no idea which of the
possibilities is more likely! This is what we call information-theoretic security: regardless of
your computation power, the best you can do is **guess** which one of all the possible contents is
the answer.

Alright, we have achieved information-theoretic security and we are done, right? No! We have yet to
examine the practical side.

Practice
--------

In our brute-force example, the cloud is looking for the correct answer among all the possibilities.
An observant reader might have noticed that the content of the `secret file` is `101010` or `42` and
of course [42 is the answer][hitchhiker]! Joking aside, this shows an attack when the attacker has
some knowledge about the form of the secret. Even if we do not consider this type of attack, there
can still be problems with the implementations. For example, consider the following implementation
of the encryption function.

{% highlight python %}
def bad_encrypt(content, password):
  m = int(content, 2)
  k = int(password, 2)
  c = m ^ k
  print "DEBUG: Encrypting {0} with {1} resulting in {2}".format(m, k, c)
  return "{0:b}".format(c).zfill(6)

bad_encrypt("101010", "100101")
#=> prints DEBUG: Encrypting 42 with 37 resulting in 15
#          '001111'
{% endhighlight %}

hmmm, that does not look very secure! As is evident, even when using algorithms that give you
information-theoretic security, you are still *trusting* that the developers have implemented a
secure program. Now, let's assume that the program is written securely and there is no vulnerability
in the code. The next question is where to store the password. If an attacker can find the password,
then all bets are off. Therefore, even with theoretically secure algorithms and *assuming* that your
programs have no vulnerabilities, you are still *trusting* that your operational security is
perfect!

Now, assume that your code is secure and your operational practices are secure, and you have no
malicious insider that is leaking your secrets, would you choose the XOR function for your
encryption needs? Probably not! Note that to encrypt a message of length 6, you needed to create a
password of length 6. Similarly, to encrypt 10 Terabyte of data that you are outsourcing to a cloud,
you would need to store 10 Terabytes of passwords locally! Which is a huge and pointless price to
pay to achieve information-theoretic security.

Reality
-------

At this point, you might be wondering why are we even bothering with theoretical security! Well, the
picture that I painted so far was an extreme case to make a point about the importance of security
in all aspects of software development and also to point out that high level of security is not
cheap and in the vast majority of cases you pay it through more computation or more memory/network
usage. The solution is research on making theoretical approaches more efficient and to find
reasonable compromises on practical security. In the past few decades, there have been significant
researches that are bringing us [closer][realmpc] to an efficient and reasonable theoretical and
practical security.

In my PhD thesis, I have done a small part in furthering such research ([AMPR14][AMPR14],
[AHMR15][AHMR15], [AMR17][AMR17]) in the field of "Secure Multiparty Computation" and I believe it
is one the most promising fields. In my future blog posts, I will introduce this field from the point
of view of a Software Engineer with the goal of encouraging other Software Engineers to adapt and
use the results of the amazing research that is being done in this field.

[facebook]: https://techcrunch.com/2018/09/28/everything-you-need-to-know-about-facebooks-data-breach-affecting-50m-users/
[vfemail]: https://krebsonsecurity.com/2019/02/email-provider-vfemail-suffers-catastrophic-hack/
[hitchhiker]: https://en.wikipedia.org/wiki/The_Hitchhiker%27s_Guide_to_the_Galaxy 
[AMPR14]: https://link.springer.com/content/pdf/10.1007/978-3-642-55220-5_22.pdf
[AHMR15]: https://link.springer.com/content/pdf/10.1007/978-3-662-46800-5_27.pdf
[AMR17]: https://eprint.iacr.org/2017/062.pdf
[realmpc]: https://eprint.iacr.org/2018/450.pdf