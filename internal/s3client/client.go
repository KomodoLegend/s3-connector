package s3client

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/alexey-stepanov/s3-connector/internal/config"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type Client struct {
	api *s3.Client
	cfg config.Connection
}

type ObjectInfo struct {
	Key          string    `json:"key"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"lastModified"`
	StorageClass string    `json:"storageClass,omitempty"`
	IsPrefix     bool      `json:"isPrefix"`
}

type BucketInfo struct {
	Name         string     `json:"name"`
	CreationDate *time.Time `json:"creationDate,omitempty"`
}

func New(ctx context.Context, c config.Connection) (*Client, error) {
	if c.Endpoint == "" {
		return nil, fmt.Errorf("endpoint is required")
	}
	region := c.Region
	if region == "" {
		region = "us-east-1"
	}

	endpoint := normalizeEndpoint(c.Endpoint, c.UseSSL)

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			c.AccessKeyID, c.SecretAccessKey, "",
		)),
	)
	if err != nil {
		return nil, err
	}

	api := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = c.PathStyle
		o.HTTPClient = &http.Client{Timeout: 10 * time.Minute}
	})
	return &Client{api: api, cfg: c}, nil
}

func normalizeEndpoint(endpoint string, useSSL bool) string {
	e := strings.TrimSpace(endpoint)
	if strings.HasPrefix(e, "http://") || strings.HasPrefix(e, "https://") {
		return strings.TrimRight(e, "/")
	}
	scheme := "https"
	if !useSSL {
		scheme = "http"
	}
	return scheme + "://" + strings.TrimRight(e, "/")
}

func (c *Client) Test(ctx context.Context) error {
	_, err := c.api.ListBuckets(ctx, &s3.ListBucketsInput{})
	return err
}

func (c *Client) ListBuckets(ctx context.Context) ([]BucketInfo, error) {
	out, err := c.api.ListBuckets(ctx, &s3.ListBucketsInput{})
	if err != nil {
		return nil, err
	}
	res := make([]BucketInfo, 0, len(out.Buckets))
	for _, b := range out.Buckets {
		info := BucketInfo{Name: aws.ToString(b.Name)}
		if b.CreationDate != nil {
			t := *b.CreationDate
			info.CreationDate = &t
		}
		res = append(res, info)
	}
	return res, nil
}

func (c *Client) ListObjects(ctx context.Context, bucket, prefix string, maxKeys int32) ([]ObjectInfo, error) {
	if maxKeys <= 0 {
		maxKeys = 200
	}
	prefix = strings.TrimLeft(prefix, "/")
	out, err := c.api.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:    aws.String(bucket),
		Prefix:    aws.String(prefix),
		Delimiter: aws.String("/"),
		MaxKeys:   aws.Int32(maxKeys),
	})
	if err != nil {
		return nil, err
	}
	res := make([]ObjectInfo, 0, len(out.CommonPrefixes)+len(out.Contents))
	for _, p := range out.CommonPrefixes {
		res = append(res, ObjectInfo{
			Key:      aws.ToString(p.Prefix),
			IsPrefix: true,
		})
	}
	for _, o := range out.Contents {
		key := aws.ToString(o.Key)
		if key == prefix {
			continue
		}
		info := ObjectInfo{
			Key:  key,
			Size: aws.ToInt64(o.Size),
		}
		if o.LastModified != nil {
			info.LastModified = *o.LastModified
		}
		if o.StorageClass != "" {
			info.StorageClass = string(o.StorageClass)
		}
		res = append(res, info)
	}
	return res, nil
}

// Download opens an object body. Caller must Close the body.
func (c *Client) Download(ctx context.Context, bucket, key string) (*s3.GetObjectOutput, error) {
	return c.api.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
}

func (c *Client) Upload(ctx context.Context, bucket, key string, body io.Reader, size int64, contentType string) error {
	in := &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
		Body:   body,
	}
	if size >= 0 {
		in.ContentLength = aws.Int64(size)
	}
	if contentType != "" {
		in.ContentType = aws.String(contentType)
	}
	_, err := c.api.PutObject(ctx, in)
	return err
}

func (c *Client) CreateBucket(ctx context.Context, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("bucket name is required")
	}
	// Prefer create without LocationConstraint (required for MinIO/Ceph/RGW).
	err := c.createBucketRaw(ctx, name, "")
	if err == nil || isBucketExistsErr(err) {
		return nil
	}
	// AWS outside us-east-1 may require a constraint — retry only for AWS endpoints.
	if !isAWSEndpoint(c.cfg.Endpoint) {
		return err
	}
	region := c.cfg.Region
	if region == "" || region == "us-east-1" {
		return err
	}
	err2 := c.createBucketRaw(ctx, name, region)
	if err2 == nil || isBucketExistsErr(err2) {
		return nil
	}
	return err2
}

func (c *Client) createBucketRaw(ctx context.Context, name, locationConstraint string) error {
	in := &s3.CreateBucketInput{Bucket: aws.String(name)}
	if locationConstraint != "" {
		in.CreateBucketConfiguration = &types.CreateBucketConfiguration{
			LocationConstraint: types.BucketLocationConstraint(locationConstraint),
		}
	}
	_, err := c.api.CreateBucket(ctx, in)
	return err
}

func isBucketExistsErr(err error) bool {
	var exists *types.BucketAlreadyOwnedByYou
	var exists2 *types.BucketAlreadyExists
	if errors.As(err, &exists) || errors.As(err, &exists2) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "bucketalreadyownedbyyou") ||
		strings.Contains(msg, "bucketalreadyexists")
}

func isAWSEndpoint(endpoint string) bool {
	e := strings.ToLower(endpoint)
	return strings.Contains(e, "amazonaws.com") ||
		strings.Contains(e, "amazonaws.com.cn") ||
		e == "" // empty = default AWS
}

// DeleteBucket removes all objects then the bucket itself.
func (c *Client) DeleteBucket(ctx context.Context, name string) error {
	var token *string
	for {
		out, err := c.api.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(name),
			ContinuationToken: token,
			MaxKeys:           aws.Int32(1000),
		})
		if err != nil {
			msg := strings.ToLower(err.Error())
			if strings.Contains(msg, "nosuchbucket") || strings.Contains(msg, "not found") {
				return nil
			}
			return err
		}
		for _, o := range out.Contents {
			_, err = c.api.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket: aws.String(name),
				Key:    o.Key,
			})
			if err != nil {
				return fmt.Errorf("delete object %s: %w", aws.ToString(o.Key), err)
			}
		}
		if !aws.ToBool(out.IsTruncated) {
			break
		}
		token = out.NextContinuationToken
	}
	_, err := c.api.DeleteBucket(ctx, &s3.DeleteBucketInput{Bucket: aws.String(name)})
	if err != nil {
		msg := strings.ToLower(err.Error())
		if strings.Contains(msg, "nosuchbucket") || strings.Contains(msg, "not found") {
			return nil
		}
	}
	return err
}
